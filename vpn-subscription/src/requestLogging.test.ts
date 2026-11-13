import { Writable } from 'node:stream';

import Fastify from 'fastify';
import {
    describe, expect, it,
} from 'vitest';

import { logController, logServerError } from './requestLogging';

const SECRET = 'subscription-secret-123';

function createServerWithLogLines() {
    const lines: string[] = [];
    const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            lines.push(chunk.toString());
            callback();
        },
    });
    const server = Fastify({
        logger: { stream },
        logController,
    });

    server.setErrorHandler(logServerError);
    server.get<{ Params: { secret: string } }>('/:secret', () => 'ok');
    server.post('/:secret', () => {
        throw new Error('Cannot send Telegram message');
    });

    return {
        server,
        getLog: () => lines.join(''),
    };
}

describe('request logging', () => {
    it('logs nothing about a successful request', async () => {
        const { server, getLog } = createServerWithLogLines();

        const response = await server.inject({
            method: 'GET',
            url: `/${SECRET}`,
        });

        expect(response.statusCode).toBe(200);
        expect(getLog()).toBe('');
    });

    it('logs nothing about a request that matches no route', async () => {
        const { server, getLog } = createServerWithLogLines();

        const response = await server.inject({
            method: 'GET',
            url: `/${SECRET}/extra`,
        });

        expect(response.statusCode).toBe(404);
        expect(getLog()).toBe('');
    });

    it('logs the error of a failed request, without its path', async () => {
        const { server, getLog } = createServerWithLogLines();

        const response = await server.inject({
            method: 'POST',
            url: `/${SECRET}`,
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toMatchObject({ message: 'Cannot send Telegram message' });
        expect(getLog()).toContain('❌ Request failed');
        expect(getLog()).toContain('Cannot send Telegram message');
        expect(getLog()).not.toContain(SECRET);
    });

    it('does not log a client error as a failure', async () => {
        const { server, getLog } = createServerWithLogLines();

        const response = await server.inject({
            method: 'POST',
            url: `/${SECRET}`,
            headers: { 'content-type': 'application/json' },
            payload: '{not json',
        });

        expect(response.statusCode).toBe(400);
        expect(getLog()).toBe('');
    });
});
