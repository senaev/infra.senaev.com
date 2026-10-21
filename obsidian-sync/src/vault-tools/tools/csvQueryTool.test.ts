import { expect, it } from 'vitest';

import { parseCsvQuery } from './csvQueryTool';

const valid = {
    tables: [
        {
            name: 't',
            paths: ['a.csv'],
        },
    ],
    sql: 'SELECT * FROM t',
};

it('uses text-only parameters and bounded default output', () => {
    expect(parseCsvQuery(valid)).toEqual({
        ...valid,
        params: [],
        maxRows: 200,
    });
    expect(parseCsvQuery({
        ...valid,
        params: [
            '00123',
            null,
        ],
    }).params).toEqual([
        '00123',
        null,
    ]);
});

it.each([
    { tables: [] },
    {
        tables: [
            {
                name: 'sqlite_secret',
                paths: ['a.csv'],
            },
        ],
    },
    {
        tables: [
            {
                name: 't',
                paths: ['../a.csv'],
            },
        ],
    },
    {
        tables: [
            {
                name: 't',
                paths: ['a.txt'],
            },
        ],
    },
    {
        tables: [
            {
                name: 't',
                paths: [
                    'a.csv',
                    'a.csv',
                ],
            },
        ],
    },
    {
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
                unknown: true,
            },
        ],
    },
    {
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
            },
            {
                name: 'T',
                paths: ['b.csv'],
            },
        ],
    },
    { sql: '' },
    { sql: 'x'.repeat(16001) },
    { sql: 'SELECT\0' },
    { params: [1] },
    { maxRows: 0 },
    { maxRows: 1001 },
    { maxRows: 1.5 },
    { unknown: true },
])('rejects invalid request %#', (changes) => {
    expect(() => parseCsvQuery({
        ...valid,
        ...changes,
    })).toThrow();
});
