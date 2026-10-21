import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import {
    afterEach, expect, it, vi,
} from 'vitest';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { createTestVault, type TestVault } from '../createTestVault';
import { csvQueryTool } from '../tools/csvQueryTool';

import { publishCsv } from './publishCsv';
import {
    runCsvQuery, type CsvQueryInput, type CsvQueryResult,
} from './runCsvQuery';

// These tests assert real SQL and real file persistence, not child-process startup.
// Real permissions, cancellation/deadline and HTTP process wiring have separate integration coverage.
vi.mock('./runCsvQuery', async () => {
    const { createRequire } = await import('node:module');
    const { execute } = createRequire(__filename)('./queryWorker.cjs') as {
        execute: (input: CsvQueryInput) => { result?: CsvQueryResult; error?: string };
    };

    return {
        runCsvQuery: vi.fn((input: CsvQueryInput) => {
            const reply = execute(structuredClone(input));

            if (reply.error || !reply.result) {
                throw new CommandError('invalid_arguments', reply.error ?? 'Invalid engine result');
            }

            return Promise.resolve(reply.result);
        }),
    };
});

let vault: TestVault | undefined;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const request = (sql: string, expectedHash?: string | null) => {
    return {
        tables: [
            {
                name: 't',
                paths: ['data.csv'],
                ...expectedHash === undefined ? {} : { expectedHash },
            },
        ],
        sql,
    };
};

afterEach(async () => {
    await vault?.remove();
});

it('creates a CSV and uses its returned hash for the next INSERT', async () => {
    vault = await createTestVault({});
    const created = await csvQueryTool(vault.config, request('CREATE TABLE t(id TEXT, value TEXT)', null));

    expect(created.hash).toBe(hash('id,value\n'));
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe('id,value\n');
    const inserted = await csvQueryTool(vault.config, {
        ...request('INSERT INTO t VALUES (?, ?)', created.hash as string),
        params: [
            '00123',
            'first',
        ],
    });

    expect(inserted).toMatchObject({
        affectedRows: 1,
        hash: hash('id,value\n00123,first\n'),
    });
});

it('updates through WITH and reads all source values as text', async () => {
    vault = await createTestVault({ 'data.csv': 'id,value\n00123,first\n' });
    const inserted = { hash: hash('id,value\n00123,first\n') };
    const updated = await csvQueryTool(vault.config, request('WITH chosen AS (SELECT \'00123\' AS id) UPDATE t SET value=\'updated\' WHERE id IN (SELECT id FROM chosen)', inserted.hash as string));

    expect(updated.hash).toBe(hash('id,value\n00123,updated\n'));
    const selected = await csvQueryTool(vault.config, request('SELECT id,value,typeof(id) FROM t'));

    expect(selected).toMatchObject({
        hash: updated.hash,
        rows: [
            [
                '00123',
                'updated',
                'text',
            ],
        ],
    });
});

it('returns unchanged hashes for unmatched deletes and keeps headers after deleting all rows', async () => {
    vault = await createTestVault({ 'data.csv': 'id,value\n00123,updated\n' });
    const updated = { hash: hash('id,value\n00123,updated\n') };
    const noop = await csvQueryTool(vault.config, request('DELETE FROM t WHERE id=\'missing\'', updated.hash as string));

    expect(noop).toMatchObject({
        changed: false,
        affectedRows: 0,
        hash: updated.hash,
    });
    const deleted = await csvQueryTool(vault.config, request('DELETE FROM t', updated.hash as string));

    expect(deleted.hash).toBe(hash('id,value\n'));
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe('id,value\n');
});

it('initializes a zero-byte CSV through CREATE TABLE without upload', async () => {
    vault = await createTestVault({ 'data.csv': '' });
    const result = await csvQueryTool(vault.config, request('CREATE TABLE t(id, value)', hash('')));

    expect(result.hash).toBe(hash('id,value\n'));
});

it('preserves hashes on errors and rejects stale hashes without overwriting data', async () => {
    const text = 'id,value\n00123,first\n';

    vault = await createTestVault({ 'data.csv': text });
    await expect(csvQueryTool(vault.config, request('UPDATE t SET value=\'changed\'', 'a'.repeat(64)))).rejects.toMatchObject({
        code: 'conflict',
        details: { hash: hash(text) },
    });
    await expect(csvQueryTool(vault.config, request('INSERT INTO t VALUES (\'x\',NULL)', hash(text)))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: hash(text) },
    });
    await expect(csvQueryTool(vault.config, request('UPDATE t SET value=\'changed\'', undefined))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: hash(text) },
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('rechecks the file hash at publication and rejects create races', async () => {
    vault = await createTestVault({ 'data.csv': 'id\nnew\n' });
    await expect(publishCsv(vault.config, {
        path: 'data.csv',
        expectedHash: hash('id\nold\n'),
        original: 'id\nold\n',
        csv: 'id\nedited\n',
    }, createCommandExecution())).rejects.toMatchObject({ code: 'conflict' });
    await expect(csvQueryTool(vault.config, request('CREATE TABLE t(id)', null))).rejects.toMatchObject({ code: 'conflict' });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe('id\nnew\n');
});

it.each([
    'DROP TABLE t',
    'ALTER TABLE t ADD COLUMN extra TEXT',
    'CREATE TRIGGER x AFTER UPDATE ON t BEGIN DELETE FROM t; END',
    'ATTACH DATABASE \'/tmp/x\' AS x',
    'UPDATE t SET value=\'x\'; DELETE FROM t',
    'UPDATE t SET value=x\'FF\'',
    'UPDATE t SET value=\'x\' RETURNING *',
])('rejects unsupported or unsafe SQL without changing the CSV: %s', async (sql) => {
    const text = 'id,value\n00123,first\n';

    vault = await createTestVault({ 'data.csv': text });
    await expect(csvQueryTool(vault.config, request(sql, hash(text)))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: hash(text) },
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('preserves BOM, CRLF, quoting, Unicode and leading zeros across edits', async () => {
    const text = '\uFEFFid,value\r\n00123,"café, 猫"\r\n';

    vault = await createTestVault({ 'data.csv': text });
    const result = await csvQueryTool(vault.config, {
        ...request('UPDATE t SET value=?', hash(text)),
        params: ['new,"quoted"\nline'],
    });

    const updated = await readFile(vault.path('data.csv'), 'utf8');

    expect(updated.startsWith('\uFEFFid,value\r\n')).toBe(true);
    expect(result.hash).toBe(hash(updated));
    expect((await csvQueryTool(vault.config, request('SELECT id,value FROM t'))).rows).toEqual([
        [
            '00123',
            'new,"quoted"\nline',
        ],
    ]);
    await writeFile(vault.path('data.csv'), text);
});

it.each([
    'CREATE TABLE t(id INTEGER)',
    'CREATE TABLE t(id TEXT PRIMARY KEY)',
    'CREATE TABLE t(id TEXT DEFAULT \'x\')',
    'CREATE TABLE t(id TEXT CHECK(id<>\'\'))',
    'CREATE TABLE t(id TEXT COLLATE NOCASE)',
    'CREATE TABLE t(id TEXT REFERENCES other(id))',
    'CREATE TABLE t AS SELECT 1 AS id',
    'CREATE TABLE t(_source_path TEXT)',
    'CREATE TABLE other(id TEXT)',
    'PRAGMA writable_schema=ON',
    'UPDATE sqlite_master SET sql=\'x\'',
])('rejects unsafe/unpersistable CREATE/schema SQL without creating a file: %s', async (sql) => {
    vault = await createTestVault({});
    await expect(csvQueryTool(vault.config, request(sql, null))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: null },
    });
    await expect(readFile(vault.path('data.csv'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('supports quoted keyword column names without treating their text as schema features', async () => {
    vault = await createTestVault({});
    const result = await csvQueryTool(vault.config, request('CREATE TABLE t("CHECK" TEXT, "a""b" TEXT)', null));

    expect(result).toMatchObject({
        affectedRows: 0,
        hash: hash('CHECK,"a""b"\n'),
    });
});

it('can read a joined table while updating exactly one physical CSV', async () => {
    vault = await createTestVault({
        'data.csv': 'id,value\n001,first\n',
        'labels.csv': 'id,label\n001,updated\n',
    });
    const result = await csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                paths: ['data.csv'],
                expectedHash: hash('id,value\n001,first\n'),
            },
            {
                name: 'labels',
                paths: ['labels.csv'],
            },
        ],
        sql: 'UPDATE t SET value=(SELECT label FROM labels WHERE labels.id=t.id)',
    });

    expect(result.hashes).toEqual([
        {
            path: 'data.csv',
            hash: hash('id,value\n001,updated\n'),
        },
        {
            path: 'labels.csv',
            hash: hash('id,label\n001,updated\n'),
        },
    ]);
    expect(await readFile(vault.path('labels.csv'), 'utf8')).toBe('id,label\n001,updated\n');
});

it('preserves byte formatting and hashes when an edit matches no rows', async () => {
    const text = '"id","value"\r\n"001","first"\r\n';

    vault = await createTestVault({ 'data.csv': text });
    const result = await csvQueryTool(vault.config, request('UPDATE t SET value=\'x\' WHERE id=\'missing\'', hash(text)));

    expect(result).toMatchObject({
        affectedRows: 0,
        changed: false,
        hash: hash(text),
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('rejects SQL edits that exceed export bounds without publishing partial changes', async () => {
    const text = 'id,value\n001,first\n';

    vault = await createTestVault({ 'data.csv': text });
    await expect(csvQueryTool(vault.config, request('UPDATE t SET value=printf(\'%70000s\',\'x\')', hash(text)))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: hash(text) },
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('keeps LF record delimiters when a quoted cell contains CRLF', async () => {
    const text = 'id,value\n001,"line1\r\nline2"\n';

    vault = await createTestVault({ 'data.csv': text });
    await csvQueryTool(vault.config, request('UPDATE t SET id=\'002\'', hash(text)));
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe('id,value\n002,"line1\r\nline2"\n');
});

it('rejects symlink paths for existing edits and new-file creation', async () => {
    const { symlink, mkdir } = await import('node:fs/promises');

    vault = await createTestVault({ 'original.csv': 'id\n001\n' });
    await symlink(vault.path('original.csv'), vault.path('data.csv'));
    await expect(csvQueryTool(vault.config, request('UPDATE t SET id=\'002\'', hash('id\n001\n')))).rejects.toMatchObject({ code: 'forbidden_path' });
    await mkdir(vault.path('real'));
    await symlink(vault.path('real'), vault.path('alias'));
    await expect(csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                paths: ['alias/new.csv'],
                expectedHash: null,
            },
        ],
        sql: 'CREATE TABLE t(id)',
    })).rejects.toMatchObject({ code: 'forbidden_path' });
    expect(await readFile(vault.path('original.csv'), 'utf8')).toBe('id\n001\n');
    await expect(readFile(vault.path('real/new.csv'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects generated NUL values so edits cannot create an unreadable CSV', async () => {
    const text = 'id,value\n001,first\n';

    vault = await createTestVault({ 'data.csv': text });
    await expect(csvQueryTool(vault.config, request('UPDATE t SET value=CAST(x\'00\' AS TEXT)', hash(text)))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: hash(text) },
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('preserves a literal BOM inside the first column name', async () => {
    const text = '"\uFEFFid",value\n001,first\n';

    vault = await createTestVault({ 'data.csv': text });
    await csvQueryTool(vault.config, request('UPDATE t SET value=\'updated\'', hash(text)));
    expect((await csvQueryTool(vault.config, request('SELECT * FROM t'))).columns[0]?.name).toBe('\uFEFFid');
});

it('treats a SELECT with expectedHash as a read and checks its precondition', async () => {
    const text = '"id","value"\r\n"001","first"\r\n';

    vault = await createTestVault({ 'data.csv': text });
    expect(await csvQueryTool(vault.config, request('SELECT id,value,_source_record FROM t', hash(text)))).toMatchObject({
        changed: false,
        hash: hash(text),
        rows: [
            [
                '001',
                'first',
                '1',
            ],
        ],
    });
    await expect(csvQueryTool(vault.config, request('SELECT * FROM t', 'a'.repeat(64)))).rejects.toMatchObject({ code: 'conflict' });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('exports a full-size edited CSV under the production worker limits', async () => {
    // Exercise the byte boundary with few fields; the read stress test separately
    // covers 40,000 records / 100 columns without paying both costs in this fixture.
    const header = 'c0,c1,c2,c3\n';
    const count = 1000;
    const row = `${'x'.repeat(4000)},,,\n`;
    const padding = 4 * 1024 * 1024 - Buffer.byteLength(header) - count * Buffer.byteLength(row);
    const text = header + 'y'.repeat(padding % 1000) + Array.from({ length: count }, () => 'y'.repeat(Math.floor(padding / count)) + row).join('');
    const actual = await vi.importActual<typeof import('./runCsvQuery')>('./runCsvQuery');

    vi.mocked(runCsvQuery).mockImplementationOnce(actual.runCsvQuery);
    expect(Buffer.byteLength(text)).toBe(4 * 1024 * 1024);
    vault = await createTestVault({ 'data.csv': text });
    const result = await csvQueryTool(vault.config, request('UPDATE t SET c0=\'changed\' WHERE rowid=1', hash(text)));
    const saved = await readFile(vault.path('data.csv'), 'utf8');

    expect(result).toMatchObject({
        affectedRows: 1,
        changed: true,
        hash: hash(saved),
    });
    expect(saved.startsWith(`${header}changed,`)).toBe(true);
    expect(saved.split('\n')).toHaveLength(count + 2);
}, 10000);
