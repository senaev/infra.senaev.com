import Fastify from 'fastify';
import pino from 'pino';
import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createHealthServer } from './createHealthServer';

const logger = pino({ level: 'silent' });
const servers: ReturnType<typeof createHealthServer>[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('createHealthServer', () => {
    it('answers the health check', async () => {
        const server = createHealthServer({
            Fastify,
            logger,
        });

        servers.push(server);

        const response = await server.inject({ url: '/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
    });

    it('uses the configured health path', async () => {
        const server = createHealthServer({
            Fastify,
            logger,
            path: '/health/live',
        });

        servers.push(server);

        const response = await server.inject({ url: '/health/live' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
        expect((await server.inject({ url: '/health' })).statusCode).toBe(404);
    });

    it('does not register any service routes', async () => {
        const server = createHealthServer({
            Fastify,
            logger,
        });

        servers.push(server);

        const response = await server.inject({
            method: 'POST',
            url: '/code/list',
            payload: { folder: '/' },
        });

        expect(response.statusCode).toBe(404);
    });
});
