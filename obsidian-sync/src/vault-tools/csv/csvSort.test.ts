import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import type { CsvQueryInput, CsvQueryResult } from './runCsvQuery';

const { execute } = createRequire(__filename)('./queryWorker.cjs') as {
    execute: (input: CsvQueryInput) => { result?: CsvQueryResult; error?: string };
};
const text = 'id,occurred_datetime,amount\na,2026-10-23T12:30,2\nb,2026-10-24T09:00,10\nc,2026-10-24T09:00,2\nd,,3\n';
const sort = (expression: string, direction = 'DESC') => {
    return {
        expression,
        direction,
    };
};

function run(paramsText?: string, sql = 'UPDATE t SET id=id', csv = text) {
    return execute({
        tables: [
            {
                name: 't',
                expectedHash: 'a'.repeat(64),
                ...paramsText === undefined ? {} : { paramsText },
                sources: [
                    {
                        path: 'a.csv',
                        text: csv,
                        hash: 'a'.repeat(64),
                        size: Buffer.byteLength(csv),
                    },
                ],
            },
        ],
        sql,
        params: [],
        maxRows: 200,
    });
}

it('sorts purchase timestamps descending, keeps ties stable and persists no computed columns', () => {
    const result = run(JSON.stringify({ sort: [sort('"occurred_datetime"')] })).result?.mutation;

    expect(result?.csv).toBe('id,occurred_datetime,amount\nb,2026-10-24T09:00,10\nc,2026-10-24T09:00,2\na,2026-10-23T12:30,2\nd,,3\n');
    expect(result?.records).toBe(4);
});

it('supports ordered keys, SQL casts, case-insensitive directions and quoted punctuation', () => {
    expect(run(JSON.stringify({
        sort: [
            sort('occurred_datetime'),
            sort('CAST(amount AS REAL)', 'asc'),
        ],
    })).result?.mutation?.csv)
        .toBe('id,occurred_datetime,amount\nc,2026-10-24T09:00,2\nb,2026-10-24T09:00,10\na,2026-10-23T12:30,2\nd,,3\n');
    expect(run(JSON.stringify({ sort: [sort('coalesce(NULLIF(occurred_datetime, \'\'), \'2026-10-25\')')] })).result?.mutation?.csv)
        .toMatch(/^id,occurred_datetime,amount\nd,,3\n/);
    expect(run(JSON.stringify({ sort: [sort('length(\'(; -- /* ? : @ $\')')] })).result?.mutation?.csv).toBe(text);
    expect(run(JSON.stringify({ sort: [sort('"a"";--?"')] }), 'UPDATE t SET id=id', 'id,"a"";--?"\nx,z\ny,a\n').result?.mutation?.csv)
        .toBe('id,"a"";--?"\nx,z\ny,a\n');
});

it('keeps existing order without settings or with an empty sort array and ignores settings for SELECT', () => {
    expect(run().result?.mutation?.csv).toBe(text);
    expect(run('{"sort":[]}').result?.mutation?.csv).toBe(text);
    expect(run('invalid', 'SELECT id FROM t').result?.rows).toEqual([
        ['a'],
        ['b'],
        ['c'],
        ['d'],
    ]);
});

it.each([
    '',
    'null',
    '[]',
    '{}',
    '{"sort":null}',
    '{"sort":[],"typo":true}',
    JSON.stringify({ sort: Array.from({ length: 17 }, () => sort('id')) }),
    ...[
        null,
        {},
        { expression: 'id' },
        sort(''),
        sort('x'.repeat(1001)),
        sort('id', 'DESC LIMIT 1'),
        {
            ...sort('id'),
            type: 'text',
        },
    ]
        .map((entry) => JSON.stringify({ sort: [entry] })),
])('rejects malformed settings: %s', (params) => {
    expect(run(params)).toHaveProperty('error');
});

it.each([
    'missing',
    '"missing"',
    'id\0',
    'id) DESC LIMIT 1 --',
    'id; DELETE FROM t',
    'id /* comment */',
    '(id',
    'id)',
    '?',
    ':bound',
    '@bound',
    '$bound',
    '\'unterminated',
    '[unterminated',
    'load_extension(id)',
    'readfile(id)',
    'random()',
    '(SELECT sql FROM sqlite_master LIMIT 1)',
    '(SELECT name FROM pragma_table_info(\'t\') LIMIT 1)',
])('rejects invalid or unsafe expressions without producing a CSV: %s', (expression) => {
    const result = run(JSON.stringify({ sort: [sort(expression)] }));

    expect(result).toHaveProperty('error');
    expect(result.result).toBeUndefined();
});

it('rejects reading other mapped tables from a sorting expression', () => {
    const result = execute({
        tables: [
            {
                name: 't',
                expectedHash: 'a'.repeat(64),
                paramsText: JSON.stringify({ sort: [sort('(SELECT secret FROM other LIMIT 1)')] }),
                sources: [
                    {
                        path: 'a.csv',
                        text: 'id\na\n',
                        hash: 'a'.repeat(64),
                        size: 5,
                    },
                ],
            },
            {
                name: 'other',
                sources: [
                    {
                        path: 'b.csv',
                        text: 'secret\nprivate\n',
                        hash: 'b'.repeat(64),
                        size: 15,
                    },
                ],
            },
        ],
        sql: 'UPDATE t SET id=id',
        params: [],
        maxRows: 1,
    });

    expect(result).toHaveProperty('error');
    expect(result.result).toBeUndefined();
});
