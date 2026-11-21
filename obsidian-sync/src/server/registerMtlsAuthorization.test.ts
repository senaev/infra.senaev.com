import {
    afterEach, describe, expect, it,
} from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createVaultServer } from './createVaultServer';
import { registerMtlsAuthentication } from './registerMtlsAuthentication';
import { registerMtlsAuthorization } from './registerMtlsAuthorization';

const servers: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('registerMtlsAuthentication', () => {
    it('refuses a request on a connection without a verified client certificate', async () => {
        const server = createVaultServer();

        servers.push(server);
        registerMtlsAuthentication(server);
        server.get('/route', () => 'ok');

        const response = await server.inject({
            method: 'GET',
            url: '/route',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({ code: 'unauthorized' });
    });
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
