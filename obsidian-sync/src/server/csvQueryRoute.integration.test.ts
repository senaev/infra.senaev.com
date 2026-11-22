import {
    afterEach, expect, it,
} from 'vitest';
import { completeOperation } from 'senaev-utils/src/operations/testing/completeOperation';
import Fastify, { type FastifyInstance } from 'fastify';

import { createTestVault, type TestVault } from '../vault-tools/createTestVault';
import { logger } from '../logger';

import { registerVaultToolRoutes } from './registerVaultToolRoutes';

let vault: TestVault | undefined;
let server: FastifyInstance | undefined;

afterEach(async () => {
    await server?.close();
    await vault?.remove();
});

it('retains a real CSV query result through managed HTTP operations', async () => {
    vault = await createTestVault({ 'a.csv': 'id,amount\n00123,100\n00124,250\n' });
    server = Fastify({
        loggerInstance: logger,
    });
    registerVaultToolRoutes(server, vault.config);
    await server.ready();
    const payload = {
        tables: [
            {
                name: 't',
                paths: ['a.csv'],
            },
        ],
        sql: 'SELECT id, amount FROM t WHERE id = ?',
        params: ['00123'],
    };

    const call = async (tool: string, body: Record<string, unknown>) => {
        const response = await server!.inject({
            method: 'POST',
            url: `/vault/${tool}`,
            payload: body,
        });

        expect(response.statusCode).toBe(200);

        return response.json();
    };
    const result = await completeOperation(await call('csv_query', payload), (args) => call('operation_result', args));

    expect(result).toMatchObject({
        status: 'ok',
        rows: [
            [
                '00123',
                '100',
            ],
        ],
        truncated: false,
        sources: [
            {
                table: 't',
                path: 'a.csv',
                records: 2,
            },
        ],
    });
});

it('returns saved and unchanged hashes through the same HTTP command, including conflict errors', async () => {
    vault = await createTestVault({});
    server = Fastify({
        loggerInstance: logger,
    });
    registerVaultToolRoutes(server, vault.config);
    await server.ready();
    const call = async (tool: string, payload: Record<string, unknown>) => {
        const response = await server!.inject({
            method: 'POST',
            url: `/vault/${tool}`,
            payload,
        });

        expect(response.statusCode).toBe(200);

        return response.json();
    };
    const complete = async (payload: Record<string, unknown>) => completeOperation(await call('csv_query', payload), (args) => call('operation_result', args));
    const created = await complete({
        tables: [
            {
                name: 't',
                paths: ['data.csv'],
                expectedHash: null,
            },
        ],
        sql: 'CREATE TABLE t(id, value)',
    });
    const inserted = await complete({
        tables: [
            {
                name: 't',
                paths: ['data.csv'],
                expectedHash: created.hash,
            },
        ],
        sql: 'INSERT INTO t VALUES (\'001\',\'first\')',
    });

    expect(inserted).toMatchObject({
        status: 'ok',
        affectedRows: 1,
        changed: true,
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    for (const result of [
        created,
        inserted,
    ]) {
        expect(result).not.toHaveProperty('diff');
        expect(result).not.toHaveProperty('diffTruncated');
    }

    const read = await complete({
        tables: [
            {
                name: 't',
                paths: ['data.csv'],
            },
        ],
        sql: 'SELECT id,value FROM t',
    });

    expect(read).toMatchObject({
        status: 'ok',
        hash: inserted.hash,
        hashes: [
            {
                path: 'data.csv',
                hash: inserted.hash,
            },
        ],
        rows: [
            [
                '001',
                'first',
            ],
        ],
    });
    const conflict = await complete({
        tables: [
            {
                name: 't',
                paths: ['data.csv'],
                expectedHash: created.hash,
            },
        ],
        sql: 'DELETE FROM t',
    });

    expect(conflict).toMatchObject({
        status: 'error',
        code: 'conflict',
        details: {
            hash: inserted.hash,
            hashes: [
                {
                    path: 'data.csv',
                    hash: inserted.hash,
                },
            ],
        },
    });
});
