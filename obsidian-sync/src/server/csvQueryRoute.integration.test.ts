import {
    afterEach, expect, it,
} from 'vitest';
import { completeOperation } from 'senaev-utils/src/operations/testing/completeOperation';

import { createTestVault, type TestVault } from '../vault-tools/createTestVault';

import { createVaultServer, type VaultServer } from './createVaultServer';
import { registerVaultToolRoutes } from './registerVaultToolRoutes';
import { registerInternalTokenCheck } from './registerInternalTokenCheck';

let vault: TestVault | undefined;
let server: VaultServer | undefined;

afterEach(async () => {
    await server?.close();
    await vault?.remove();
});

it('authenticates and retains a real CSV query result through managed HTTP operations', async () => {
    vault = await createTestVault({ 'a.csv': 'id,amount\n00123,100\n00124,250\n' });
    server = createVaultServer();
    registerInternalTokenCheck(server, 'test-token');
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

    expect((await server.inject({
        method: 'POST',
        url: '/vault/csv_query',
        payload,
    })).statusCode).toBe(401);
    const call = async (tool: string, body: Record<string, unknown>) => {
        const response = await server!.inject({
            method: 'POST',
            url: `/vault/${tool}`,
            headers: { authorization: 'Bearer test-token' },
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
