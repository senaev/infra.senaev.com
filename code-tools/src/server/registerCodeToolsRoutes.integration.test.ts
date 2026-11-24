import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import { createTestRepositories, type TestRepositories } from '../tools/createTestRepositories';

import { createTestCodeToolsServer, type TestCodeToolsServer } from './createTestCodeToolsServer';

describe('registerCodeToolsRoutes', () => {
    let repos: TestRepositories;
    let server: TestCodeToolsServer;

    beforeEach(async () => {
        repos = await createTestRepositories({ demo: { 'README.md': 'hello\n' } });
        server = createTestCodeToolsServer(repos.config);
    });

    afterEach(async () => {
        await server.close();
        await repos.remove();
    });

    it('runs a tool', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/code/read',
            payload: { paths: [repos.path('demo', 'README.md')] },
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
            payload: {},
        });
        const missingFile = await server.inject({
            method: 'POST',
            url: '/code/read',
            payload: { paths: [repos.path('nope', 'README.md')] },
        });

        expect(unknown.statusCode).toBe(404);
        expect(unknown.json()).toMatchObject({ code: 'unknown_tool' });
        const relativePath = await server.inject({
            method: 'POST',
            url: '/code/read',
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
