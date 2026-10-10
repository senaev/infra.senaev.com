import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

const TOKEN = 'test-token';

describe('createCodeToolsServer', () => {
    let server: CodeToolsServer | undefined;

    afterEach(async () => {
        await server?.close();
    });

    it('answers the health check without a token', async () => {
        server = createCodeToolsServer(TOKEN);

        const response = await server.inject({ url: '/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
    });

    it('rejects other routes without the internal token', async () => {
        server = createCodeToolsServer(TOKEN);

        const response = await server.inject({
            method: 'POST',
            url: '/code/projects',
        });

        expect(response.statusCode).toBe(401);
    });

    it('lets a request with the internal token through', async () => {
        server = createCodeToolsServer(TOKEN);

        const response = await server.inject({
            method: 'POST',
            url: '/code/projects',
            headers: { authorization: createBearerAuthorizationHeader(TOKEN) },
        });

        expect(response.statusCode).toBe(404);
    });
});
