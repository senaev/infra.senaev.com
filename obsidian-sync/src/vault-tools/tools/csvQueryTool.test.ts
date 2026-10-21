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
    { params: null },
    { maxRows: null },
    {
        params: [
            'x'.repeat(40000),
            'x'.repeat(40000),
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

it('accepts version preconditions without adding an operation flag', () => {
    expect(parseCsvQuery({
        ...valid,
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
                expectedHash: null,
            },
        ],
    }).tables[0]?.expectedHash).toBeNull();
    expect(parseCsvQuery({
        ...valid,
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
                expectedHash: 'a'.repeat(64),
            },
        ],
    }).tables[0]?.expectedHash).toBe('a'.repeat(64));
});

it.each([
    {
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
                expectedHash: 'bad',
            },
        ],
    },
    {
        tables: [
            {
                name: 't',
                paths: [
                    'a.csv',
                    'b.csv',
                ],
                expectedHash: 'a'.repeat(64),
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
                name: 'other',
                paths: ['a.csv'],
            },
        ],
    },
    { editing: true },
    { columns: ['id'] },
])('rejects invalid edit metadata or a separate mode/schema argument %#', (changes) => {
    expect(() => parseCsvQuery({
        ...valid,
        ...changes,
    })).toThrow();
});
