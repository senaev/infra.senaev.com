import { readFile as readFsFile } from 'node:fs/promises';

import {
    afterEach, expect, it,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { createTestVault, type TestVault } from '../createTestVault';
import { csvQueryTool } from '../tools/csvQueryTool';

import { runCsvQuery, type CsvQueryInput } from './runCsvQuery';

const source = (text = 'id,amount\n00123,100\n00124,250\n') => {
    return {
        path: 'a.csv',
        text,
        hash: 'a'.repeat(64),
        size: Buffer.byteLength(text),
    };
};
const input = (sql: string, text?: string): CsvQueryInput => {
    return {
        tables: [
            {
                name: 't',
                sources: [source(text)],
            },
        ],
        sql,
        params: [],
        maxRows: 200,
    };
};
const run = (sql: string, text?: string) => runCsvQuery(input(sql, text), createCommandExecution());
let vault: TestVault | undefined;

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

it('preserves TEXT, empty fields, UTF-8, BOM, quoted multiline records and provenance', async () => {
    const result = await run('SELECT *, typeof(id), typeof(amount) FROM t', '\uFEFFid,amount\r\n00123," café,\n猫 "\r\n00124,\r\n');

    expect(result.rows).toEqual([
        [
            '00123',
            ' café,\n猫 ',
            'a.csv',
            '1',
            'text',
            'text',
        ],
        [
            '00124',
            '',
            'a.csv',
            '2',
            'text',
            'text',
        ],
    ]);
    expect(result.sources).toEqual([
        expect.objectContaining({
            path: 'a.csv',
            records: 2,
            hash: 'a'.repeat(64),
        }),
    ]);
});

it('supports joins, CTEs, grouping, parameters and exact integer sums across files', async () => {
    const request = input('WITH x AS (SELECT * FROM t WHERE CAST(amount AS INTEGER) >= CAST(? AS INTEGER)) SELECT c.category, SUM(CAST(x.amount AS INTEGER)) AS total FROM x JOIN c USING(id) GROUP BY c.category');

    request.tables[0]?.sources.push(source('id,amount\n00123,50\n'));
    request.tables.push({
        name: 'c',
        sources: [source('id,category\n00123,food\n00124,food\n')],
    });
    request.params = ['50'];
    expect((await runCsvQuery(request, createCommandExecution())).rows).toEqual([
        [
            'food',
            400,
        ],
    ]);
    expect((await run('SELECT 9007199254740993, NULL, 1.5')).rows).toEqual([
        [
            '9007199254740993',
            null,
            1.5,
        ],
    ]);
});

it.each([
    'DELETE FROM t',
    'UPDATE t SET amount=0',
    'CREATE TABLE x(a)',
    'ATTACH DATABASE \'/tmp/x\' AS x',
    'PRAGMA database_list',
    'SELECT load_extension(\'x\')',
    'SELECT readfile(\'/etc/passwd\')',
    'SELECT * FROM sqlite_master',
    'SELECT * FROM pragma_table_info(\'t\')',
    'SELECT 1; SELECT 2',
    'SELECT 1; DELETE FROM t',
    'SELECT randomblob(1000000)',
    'SELECT zeroblob(1000000)',
])('rejects unauthorized SQL: %s', async (sql) => {
    await expect(run(sql)).rejects.toMatchObject({ code: 'invalid_arguments' });
});

it.each([
    '',
    'id,id\n1,2',
    'id,ID\n1,2',
    ',amount\n1,2',
    '_source_path\nx',
    'rowid\nx',
    'id\n"unclosed',
    'id,amount\n1',
])('rejects malformed or ambiguous CSV %#', async (text) => {
    await expect(run('SELECT * FROM t', text)).rejects.toMatchObject({ code: 'invalid_arguments' });
});

it('rejects mismatched headers and does not hide invalid records behind SQL LIMIT', async () => {
    const request = input('SELECT * FROM t LIMIT 0');

    request.tables[0]?.sources.push(source('amount,id\n1,2'));
    await expect(runCsvQuery(request, createCommandExecution())).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(run('SELECT * FROM t LIMIT 0', `id\n${'x\n'.repeat(50001)}`)).rejects.toMatchObject({ code: 'invalid_arguments' });
});

it('reports row/byte truncation accurately and preserves duplicate result column names', async () => {
    const request = input('SELECT id AS x, amount AS x FROM t');

    request.maxRows = 1;
    expect(await runCsvQuery(request, createCommandExecution())).toMatchObject({
        rows: [
            [
                '00123',
                '100',
            ],
        ],
        truncated: true,
        truncationReason: 'row_limit',
    });
    request.sql = 'SELECT * FROM t LIMIT 1';
    expect(await runCsvQuery(request, createCommandExecution())).toMatchObject({ truncated: false });
    expect(await run('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100) SELECT printf(\'%10000s\', \'x\') FROM n')).toMatchObject({
        truncated: true,
        truncationReason: 'byte_limit',
    });
});

it('cancels CPU-bound SQL and permits the next query after reaping', async () => {
    const controller = new AbortController();
    const pending = runCsvQuery(input('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n'), createCommandExecution({ signal: controller.signal }));

    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    expect((await run('SELECT COUNT(*) FROM t')).rows).toEqual([[2]]);
});

it('securely reads real vault CSV snapshots and leaves the source bytes unchanged', async () => {
    const text = 'id,amount\n00123,100\n';

    vault = await createTestVault({ 'a.csv': text });
    const result = await csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
            },
        ],
        sql: 'SELECT id, amount FROM t',
    });

    expect(result.rows).toEqual([
        [
            '00123',
            '100',
        ],
    ]);
    expect(result.sources).toEqual([
        expect.objectContaining({
            size: Buffer.byteLength(text),
            hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
    ]);
    const { readFile, symlink } = await import('node:fs/promises');

    expect(await readFile(vault.path('a.csv'), 'utf8')).toBe(text);
    await symlink(vault.path('a.csv'), vault.path('alias.csv'));
    await expect(csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                paths: ['alias.csv'],
            },
        ],
        sql: 'SELECT * FROM t',
    })).rejects.toMatchObject({ code: 'forbidden_path' });
});

it('accepts header-only files and safely quotes unusual column names', async () => {
    expect((await run('SELECT COUNT(*) FROM t', 'id,amount\n')).rows).toEqual([[0]]);
    expect((await run('SELECT "a""b", "__proto__" FROM t', '"a""b",__proto__\n00123,value\n')).rows).toEqual([
        [
            '00123',
            'value',
        ],
    ]);
});

it('enforces SQLite expression/value limits and rejects BLOB/non-finite values', async () => {
    await expect(run('SELECT printf(\'%1000000000s\', \'x\')')).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(run('SELECT x\'0001\'')).rejects.toThrow('BLOB');
    await expect(run('SELECT 1e999')).rejects.toThrow('Non-finite');
    await expect(run('SELECT * FROM t; SELECT 1')).rejects.toThrow('Exactly one');
});

it('kills an actual CPU-bound query at the deadline', async () => {
    await expect(run('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) SELECT count(*) FROM n')).rejects.toThrow('5 second deadline');
    expect((await run('SELECT 1')).rows).toEqual([[1]]);
}, 10000);

it('rejects invalid UTF-8, NULs and oversized snapshots before querying', async () => {
    const { writeFile, truncate } = await import('node:fs/promises');

    vault = await createTestVault({ 'a.csv': '' });
    const request = {
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
            },
        ],
        sql: 'SELECT * FROM t',
    };

    await writeFile(vault.path('a.csv'), Buffer.from([255]));
    await expect(csvQueryTool(vault.config, request)).rejects.toThrow('UTF-8');
    await writeFile(vault.path('a.csv'), 'id\n\0');
    await expect(csvQueryTool(vault.config, request)).rejects.toThrow('NUL');
    await truncate(vault.path('a.csv'), 10 * 1024 * 1024 + 1);
    await expect(csvQueryTool(vault.config, request)).rejects.toMatchObject({ code: 'file_too_large' });
});

it('supports analytical window functions without opening additional capabilities', async () => {
    expect((await run('SELECT id, row_number() OVER (ORDER BY id), SUM(CAST(amount AS INTEGER)) OVER () FROM t')).rows).toEqual([
        [
            '00123',
            1,
            350,
        ],
        [
            '00124',
            2,
            350,
        ],
    ]);
});

it('bounds decoded record bytes across multiple Unicode fields', async () => {
    const text = `a,b,c\n${'猫'.repeat(10000)},${'猫'.repeat(10000)},${'猫'.repeat(10000)}\n`;

    await expect(run('SELECT * FROM t', text)).rejects.toThrow('64 KiB');
});

it('imports the full 10 MiB limit with many short fields without retaining all parsed rows', async () => {
    const header = `${Array.from({ length: 100 }, (_, index) => `c${index}`).join(',')}\n`;
    const row = `${','.repeat(99)}\n`;
    const count = 40000;
    const padding = 10 * 1024 * 1024 - Buffer.byteLength(header) - count * Buffer.byteLength(row);
    const block = Math.floor(padding / 128);
    const text = header + Array.from({ length: 128 }, (_, index) => 'x'.repeat(index === 127 ? padding - 127 * block : block) + row).join('') + row.repeat(count - 128);

    expect(Buffer.byteLength(text)).toBe(10 * 1024 * 1024);
    expect(await run('SELECT count(*) FROM t', text)).toMatchObject({
        rows: [[count]],
        truncated: false,
    });
}, 10000);

it('discovers direct sibling CSV files from a folder as one logical read-only table', async () => {
    vault = await createTestVault({
        'finances/2025.csv': 'id,amount\na,10\n',
        'finances/2026.csv': 'id,amount\nb,20\n',
        'finances/csv.params.json': '{"sort":[]}',
        'finances/nested/2024.csv': 'id,amount\nc,40\n',
        'finances/ignore.txt': 'not csv',
    });

    const result = await csvQueryTool(vault.config, {
        tables: [
            {
                name: 'transactions',
                folder: 'finances',
            },
        ],
        sql: 'SELECT id, amount, _source_path, _source_record FROM transactions ORDER BY id',
    });

    expect(result.rows).toEqual([
        [
            'a',
            '10',
            'finances/2025.csv',
            '1',
        ],
        [
            'b',
            '20',
            'finances/2026.csv',
            '1',
        ],
    ]);
    expect(result.sources).toHaveLength(2);
});

it('rejects folder queries that are empty, too large, duplicated, or try to write', async () => {
    const contents: Record<string, string> = {
        'finances/2025.csv': 'id,amount\na,10\n',
        'finances/2026.csv': 'id,amount\nb,20\n',
        'empty/readme.md': 'empty',
    };

    for (let year = 2000; year < 2017; year++) {
        contents[`many/${year}.csv`] = 'id,amount\na,1\n';
    }

    vault = await createTestVault(contents);
    const query = (folder: string, sql = 'SELECT count(*) FROM t') => csvQueryTool(vault!.config, {
        tables: [
            {
                name: 't',
                folder,
            },
        ],
        sql,
    });

    await expect(query('empty')).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(query('many')).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(query('finances', 'UPDATE t SET amount=0')).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                folder: 'finances',
            },
            {
                name: 'other',
                paths: ['finances/2025.csv'],
            },
        ],
        sql: 'SELECT count(*) FROM t',
    })).rejects.toMatchObject({ code: 'invalid_arguments' });
    expect(await readFsFile(vault.path('finances/2025.csv'), 'utf8')).toBe('id,amount\na,10\n');
});

it('rejects CSV symlinks discovered in a folder rather than following them', async () => {
    const { symlink } = await import('node:fs/promises');

    vault = await createTestVault({
        'finances/2025.csv': 'id,amount\na,10\n',
        'private.csv': 'id,amount\nsecret,123\n',
    });
    await symlink(vault.path('private.csv'), vault.path('finances/2026.csv'));

    await expect(csvQueryTool(vault.config, {
        tables: [
            {
                name: 't',
                folder: 'finances',
            },
        ],
        sql: 'SELECT * FROM t',
    })).rejects.toMatchObject({ code: 'forbidden_path' });
});
