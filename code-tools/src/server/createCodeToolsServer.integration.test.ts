import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import { createTestProjects, type TestProjects } from '../tools/createTestProjects';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

const TOKEN = 'test-token';
const AUTHORIZED = { authorization: createBearerAuthorizationHeader(TOKEN) };

describe('createCodeToolsServer', () => {
    let projects: TestProjects;
    let server: CodeToolsServer;

    beforeEach(async () => {
        projects = await createTestProjects({ demo: { 'README.md': 'hello\n' } });
        server = createCodeToolsServer(TOKEN, projects.config);
    });

    afterEach(async () => {
        await server.close();
        await projects.remove();
    });

    it('answers the health check without a token', async () => {
        const response = await server.inject({ url: '/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
    });

    it('rejects a tool call without the internal token', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/code/list',
            payload: { folder: projects.root },
        });

        expect(response.statusCode).toBe(401);
    });

    it('runs a tool with the internal token', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/code/read',
            headers: AUTHORIZED,
            payload: { paths: [projects.path('demo', 'README.md')] },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            status: 'ok',
            files: [{ content: 'hello\n' }],
        });
    });

    it('answers an unknown tool and a tool error with their status codes', async () => {
        const unknown = await server.inject({
            method: 'POST',
            url: '/code/delete',
            headers: AUTHORIZED,
            payload: {},
        });
        const missingFile = await server.inject({
            method: 'POST',
            url: '/code/read',
            headers: AUTHORIZED,
            payload: { paths: [projects.path('nope', 'README.md')] },
        });

        expect(unknown.statusCode).toBe(404);
        expect(unknown.json()).toMatchObject({ code: 'unknown_tool' });
        const relativePath = await server.inject({
            method: 'POST',
            url: '/code/read',
            headers: AUTHORIZED,
            payload: { paths: ['demo/README.md'] },
        });

        expect(relativePath.statusCode).toBe(200);
        expect(relativePath.json()).toMatchObject({
            code: 'invalid_arguments',
            operation: { state: 'failed' },
        });
        expect(missingFile.statusCode).toBe(200);
        expect(missingFile.json()).toMatchObject({
            code: 'not_found',
            operation: { state: 'failed' },
        });
    });
});
