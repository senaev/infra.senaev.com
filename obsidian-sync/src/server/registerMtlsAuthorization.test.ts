import {
    afterEach, describe, expect, it,
} from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createVaultServer } from './createVaultServer';
import { registerMtlsAuthorization } from './registerMtlsAuthorization';

const servers: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('registerMtlsAuthorization', () => {
    it('refuses everything when no authentication ran before it, even for an allowed name', async () => {
        const server = createVaultServer();

        servers.push(server);
        registerMtlsAuthorization(server, ['service-a.test.svc.cluster.local']);
        server.get('/route', () => 'ok');

        const response = await server.inject({
            method: 'GET',
            url: '/route',
        });

        expect(response.statusCode).toBe(401);
    });
});
