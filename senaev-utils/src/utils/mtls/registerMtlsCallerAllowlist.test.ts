import {
    afterEach, describe, expect, it,
} from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerMtlsCallerAllowlist } from './registerMtlsCallerAllowlist';

const servers: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('registerMtlsCallerAllowlist', () => {
    it('refuses everything when no authentication ran before it, even for an allowed name', async () => {
        const server = Fastify();

        servers.push(server);
        registerMtlsCallerAllowlist(server, ['service-a.test.svc.cluster.local']);
        server.get('/route', () => 'ok');

        const response = await server.inject({
            method: 'GET',
            url: '/route',
        });

        expect(response.statusCode).toBe(401);
    });
});
