import { writeFile } from 'node:fs/promises';

import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { downloadTool } from '../vault-tools/tools/downloadTool';
import { createTestVault, type TestVault } from '../vault-tools/createTestVault';

import { createVaultServer, type VaultServer } from './createVaultServer';
import { registerInternalTokenCheck } from './registerInternalTokenCheck';
import { registerPublicFileRoutes } from './registerPublicFileRoutes';
import { registerVaultToolRoutes } from './registerVaultToolRoutes';

const TOKEN = 'internal-token';
const AUTHORIZED = { authorization: `Bearer ${TOKEN}` };

let vault: TestVault;
let server: VaultServer;

beforeAll(async () => {
    vault = await createTestVault({ 'Note.md': '# Note\n' });
    server = createVaultServer();
    registerInternalTokenCheck(server, TOKEN);
    registerVaultToolRoutes(server, vault.config);
    server.get('/milestones', () => {
        return { status: 'ok' };
    });
    registerPublicFileRoutes(server);
    await server.ready();
});

afterAll(async () => {
    await server.close();
    await vault.remove();
});

function callTool(tool: string, body: unknown, headers: Record<string, string> = AUTHORIZED) {
    return server.inject({
        method: 'POST',
        url: `/vault/${tool}`,
        headers,
        payload: body as Record<string, unknown>,
    });
}

describe('internal token check', () => {
    it('rejects vault tool calls without the token or with a wrong one', async () => {
        expect((await callTool('list', {}, {})).statusCode).toBe(401);
        expect((await callTool('list', {}, { authorization: 'Bearer wrong' })).statusCode).toBe(401);
    });

    it('protects the existing routes too', async () => {
        expect((await server.inject({
            method: 'GET',
            url: '/milestones',
        })).statusCode).toBe(401);
        expect((await server.inject({
            method: 'GET',
            url: '/milestones',
            headers: AUTHORIZED,
        })).statusCode).toBe(200);
    });

    it('leaves the ?note= / ?file= routes open for nextjs-app', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/',
        });

        expect(response.statusCode).toBe(400);
        expect(response.body).toContain('Missing required query parameter');
    });
});

describe('vault tool routes', () => {
    it('returns the tool result with status ok', async () => {
        const response = await callTool('list', {});

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            status: 'ok',
            entries: [{ path: 'Note.md' }],
        });
    });

    it('maps an expected failure to its status, code and message', async () => {
        const response = await callTool('read', { paths: ['Missing.md'] });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            operation: { state: 'failed' },
            status: 'error',
            code: 'not_found',
            message: 'File does not exist',
        });
    });

    it('answers an unknown tool with 404, also for names inherited from Object', async () => {
        for (const tool of [
            'permanent_delete',
            'constructor',
        ]) {
            const response = await callTool(tool, {});

            expect(response.statusCode).toBe(404);
            expect(response.json()).toMatchObject({ code: 'unknown_tool' });
        }
    });
});

it('serves private resource bytes only with internal authentication', async () => {
    const result = await downloadTool(vault.config, { path: 'Note.md' });
    const payload = { uri: result.resource.uri };

    expect((await server.inject({
        method: 'POST',
        url: '/vault-file-resource',
        payload,
    })).statusCode).toBe(401);
    const response = await server.inject({
        method: 'POST',
        url: '/vault-file-resource',
        headers: AUTHORIZED,
        payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ contents: { blob: string }[] }>();

    expect(Buffer.from(body.contents[0]?.blob ?? '', 'base64').toString('utf8')).toBe('# Note\n');
});

it('transfers a resource larger than the managed result quota without pagination', async () => {
    const text = 'x'.repeat(800_000);

    await writeFile(vault.path('large.csv'), text);
    const download = await downloadTool(vault.config, { path: 'large.csv' });
    const response = await server.inject({
        method: 'POST',
        url: '/vault-file-resource',
        headers: AUTHORIZED,
        payload: { uri: download.resource.uri },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ contents: { blob: string }[] }>();

    expect(Buffer.from(body.contents[0]?.blob ?? '', 'base64').toString('utf8')).toBe(text);
});
