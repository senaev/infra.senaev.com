import {
    afterEach, expect, it, vi,
} from 'vitest';

import { createVaultToolsConfig } from '../vaultToolsConfig';

import { csvQueryTool } from './csvQueryTool';

const { read, query } = vi.hoisted(() => {
    return {
        read: vi.fn(),
        query: vi.fn(),
    };
});

vi.mock('../access/readDownloadBytes', () => {
    return { readDownloadFile: read };
});
vi.mock('../csv/runCsvQuery', () => {
    return { runCsvQuery: query };
});
const config = createVaultToolsConfig('/vault');
const request = {
    tables: [
        {
            name: 't',
            paths: ['a.csv'],
        },
    ],
    sql: 'SELECT * FROM t',
};
const snapshot = {
    bytes: Buffer.from('id\n00123'),
    size: 8,
    hash: 'a'.repeat(64),
};

afterEach(() => {
    vi.clearAllMocks();
});

it('holds admission during snapshot reads and releases it after success', async () => {
    let release!: (value: typeof snapshot) => void;

    read.mockReturnValue(new Promise((resolve) => {
        release = resolve;
    }));
    query.mockResolvedValue({
        rows: [['00123']],
        sources: [],
    });
    const first = csvQueryTool(config, request);

    await expect(csvQueryTool(config, request)).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'csv_query_capacity' },
    });
    release(snapshot);
    expect((await first).rows).toEqual([['00123']]);
    read.mockResolvedValue(snapshot);
    expect((await csvQueryTool(config, request)).rows).toEqual([['00123']]);
});

it('releases admission after snapshot or query errors', async () => {
    read.mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(snapshot);
    await expect(csvQueryTool(config, request)).rejects.toThrow('read failed');
    query.mockRejectedValueOnce(new Error('query failed')).mockResolvedValue({
        rows: [],
        sources: [],
    });
    await expect(csvQueryTool(config, request)).rejects.toThrow('query failed');
    expect((await csvQueryTool(config, request)).rows).toEqual([]);
});
