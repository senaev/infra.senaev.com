import Fastify from 'fastify';
import {
    afterEach, describe, expect, it,
} from 'vitest';

import { registerMtlsAuthentication } from './registerMtlsAuthentication';

const servers: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('registerMtlsAuthentication', () => {
    it('refuses a request on a connection without a verified client certificate', async () => {
        const server = Fastify();

        servers.push(server);
        registerMtlsAuthentication(server);
        server.get('/route', () => 'ok');

        const response = await server.inject({
            method: 'GET',
            url: '/route',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
            code: 'unauthorized',
            message: 'No verified client certificate',
        });
    });
});
