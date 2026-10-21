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
    'ALTER TABLE t RENAME COLUMN value TO extra',
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

it('imports entirely empty records as empty TEXT cells alongside nonempty records', async () => {
    vault = await createTestVault({ 'data.csv': 'id,value\n,\n001,\n' });
    expect((await csvQueryTool(vault.config, request('SELECT id,value,typeof(id),typeof(value) FROM t'))).rows).toEqual([
        [
            '',
            '',
            'text',
            'text',
        ],
        [
            '001',
            '',
            'text',
            'text',
        ],
    ]);
});

it('initializes a BOM-only file instead of treating CREATE as an unmatched edit', async () => {
    vault = await createTestVault({ 'data.csv': '\uFEFF' });
    const result = await csvQueryTool(vault.config, request('CREATE TABLE t(id TEXT, value TEXT)', hash('\uFEFF')));

    expect(result).toMatchObject({
        changed: true,
        affectedRows: 0,
        hash: hash('\uFEFFid,value\n'),
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe('\uFEFFid,value\n');
});

it.each([
    'ALTER TABLE t ADD COLUMN extra TEXT',
    'ALTER TABLE t ADD extra',
    'ALTER TABLE main.t ADD COLUMN "extra" TEXT;',
    '-- leading comment\nALTER /* boundary */ TABLE `t` ADD [extra] text; -- trailing comment',
    'ALTER TABLE \'t\' ADD COLUMN \'extra\' \'TEXT\'',
])('adds an empty TEXT column and returns its saved hash: %s', async (sql) => {
    const text = 'id,value\n00123,first\n';
    const saved = 'id,value,extra\n00123,first,\n';

    vault = await createTestVault({ 'data.csv': text });
    const result = await csvQueryTool(vault.config, request(sql, hash(text)));

    expect(result).toMatchObject({
        changed: true,
        affectedRows: 0,
        hash: hash(saved),
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(saved);
    expect((await csvQueryTool(vault.config, request('SELECT id,value,extra,typeof(extra) FROM t'))).rows).toEqual([
        [
            '00123',
            'first',
            '',
            'text',
        ],
    ]);
});

it.each([
    'ALTER TABLE t DROP COLUMN value',
    'ALTER TABLE t DROP value;',
    'ALTER TABLE "main"."t" DROP COLUMN [value] /* trailing comment */',
])('drops only the selected column and preserves row order: %s', async (sql) => {
    const text = 'id,value\n00123,first\n00124,second\n';
    const saved = 'id\n00123\n00124\n';

    vault = await createTestVault({ 'data.csv': text });
    expect(await csvQueryTool(vault.config, request(sql, hash(text)))).toMatchObject({
        changed: true,
        affectedRows: 0,
        hash: hash(saved),
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(saved);
});

it('changes headers in an empty table even though no rows are affected', async () => {
    vault = await createTestVault({ 'data.csv': 'id,value\n' });
    const added = await csvQueryTool(vault.config, request('ALTER TABLE t ADD extra', hash('id,value\n')));

    expect(added.hash).toBe(hash('id,value,extra\n'));
    const dropped = await csvQueryTool(vault.config, request('ALTER TABLE t DROP value', added.hash as string));

    expect(dropped.hash).toBe(hash('id,extra\n'));
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe('id,extra\n');
});

it.each([
    'ALTER TABLE t RENAME TO other',
    'ALTER TABLE t RENAME COLUMN value TO other',
    'ALTER TABLE t ADD extra INTEGER',
    'ALTER TABLE t ADD extra TEXT DEFAULT \'x\'',
    'ALTER TABLE t ADD extra TEXT NOT NULL',
    'ALTER TABLE t ADD extra TEXT UNIQUE',
    'ALTER TABLE t ADD extra TEXT CHECK(length(extra)>0)',
    'ALTER TABLE t ADD extra TEXT REFERENCES other(id)',
    'ALTER TABLE t ADD extra TEXT COLLATE NOCASE',
    'ALTER TABLE t ADD extra TEXT GENERATED ALWAYS AS (id)',
    'ALTER TABLE t ADD _source_path TEXT',
    'ALTER TABLE t ADD rowid TEXT',
    'ALTER TABLE t ADD ID TEXT',
    'ALTER TABLE t DROP _source_record',
    'ALTER TABLE t DROP missing',
    'ALTER TABLE t ADD extra TEXT; DELETE FROM t',
    'ALTER TABLE temp.t ADD extra TEXT',
    'ALTER TABLE missing ADD extra TEXT',
])('rejects unsupported or invalid schema changes without publication: %s', async (sql) => {
    const text = 'id,value\n00123,first\n';

    vault = await createTestVault({ 'data.csv': text });
    await expect(csvQueryTool(vault.config, request(sql, hash(text)))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: hash(text) },
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('requires the latest hash and a single-file target for column changes', async () => {
    const text = 'id,value\n00123,first\n';

    vault = await createTestVault({
        'data.csv': text,
        'second.csv': text,
    });
    await expect(csvQueryTool(vault.config, request('ALTER TABLE t ADD extra', undefined))).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(csvQueryTool(vault.config, request('ALTER TABLE t DROP value', 'a'.repeat(64)))).rejects.toMatchObject({ code: 'conflict' });
    await expect(csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                paths: [
                    'data.csv',
                    'second.csv',
                ],
            },
        ],
        sql: 'ALTER TABLE t ADD extra',
    })).rejects.toMatchObject({ code: 'invalid_arguments' });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('rejects dropping the last column and adding a 101st column', async () => {
    const wide = `${Array.from({ length: 100 }, (_, index) => `c${index}`).join(',')}\n`;

    vault = await createTestVault({
        'data.csv': 'id\n00123\n',
        'wide.csv': wide,
    });
    await expect(csvQueryTool(vault.config, request('ALTER TABLE t DROP id', hash('id\n00123\n')))).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                paths: ['wide.csv'],
                expectedHash: hash(wide),
            },
        ],
        sql: 'ALTER TABLE t ADD extra',
    })).rejects.toMatchObject({ code: 'invalid_arguments' });
    expect(await readFile(vault.path('wide.csv'), 'utf8')).toBe(wide);
});

it('quotes column identifiers safely and preserves BOM and CRLF across schema changes', async () => {
    const text = '\uFEFFid,value\r\n00123,"café, 猫"\r\n';

    vault = await createTestVault({ 'data.csv': text });
    const result = await csvQueryTool(vault.config, request('ALTER TABLE t ADD COLUMN "x""; DROP TABLE t; --" TEXT', hash(text)));
    const saved = await readFile(vault.path('data.csv'), 'utf8');

    expect(saved).toBe('\uFEFFid,value,"x""; DROP TABLE t; --"\r\n00123,"café, 猫",\r\n');
    expect(result.hash).toBe(hash(saved));
    expect((await csvQueryTool(vault.config, request('SELECT id,value FROM t'))).rows).toEqual([
        [
            '00123',
            'café, 猫',
        ],
    ]);
    const dropped = await csvQueryTool(vault.config, request('ALTER TABLE t DROP COLUMN "x""; DROP TABLE t; --"', result.hash as string));

    expect(dropped.hash).toBe(hash(text));
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

it('runs ADD and DROP through the restricted subprocess and atomic publisher', async () => {
    const text = 'id,value\n00123,first\n';
    const actual = await vi.importActual<typeof import('./runCsvQuery')>('./runCsvQuery');

    vault = await createTestVault({ 'data.csv': text });
    vi.mocked(runCsvQuery).mockImplementationOnce(actual.runCsvQuery);
    const added = await csvQueryTool(vault.config, request('ALTER TABLE t ADD extra TEXT', hash(text)));

    expect(added.hash).toBe(hash('id,value,extra\n00123,first,\n'));
    vi.mocked(runCsvQuery).mockImplementationOnce(actual.runCsvQuery);
    const dropped = await csvQueryTool(vault.config, request('ALTER TABLE t DROP extra', added.hash as string));

    expect(dropped.hash).toBe(hash(text));
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});

// Full header-size parsing is the behavior under test: retain real CSV/SQLite
// execution as a large-input integration check, separate from the 100 ms unit budget.
it('rejects header growth beyond import limits without rewriting the CSV', async () => {
    const headers = Array.from({ length: 99 }, (_, index) => `c${index}_${'a'.repeat(600)}`);
    const text = `${headers.join(',')}\n`;

    expect(headers.reduce((bytes, header) => bytes + Buffer.byteLength(header), 0) + 6500).toBeGreaterThan(65536);

    vault = await createTestVault({ 'data.csv': text });
    await expect(csvQueryTool(vault.config, request(`ALTER TABLE t ADD COLUMN "${'b'.repeat(6500)}" TEXT`, hash(text)))).rejects.toMatchObject({
        code: 'invalid_arguments',
        details: { hash: hash(text) },
    });
    expect(await readFile(vault.path('data.csv'), 'utf8')).toBe(text);
});
