import { Writable } from 'node:stream';

import Fastify from 'fastify';
import {
    describe, expect, it,
} from 'vitest';

import { replyNotFound, serializeRequest } from './requestLogging';

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
        logger: {
            stream,
            serializers: { req: serializeRequest },
        },
    });

    server.setNotFoundHandler(replyNotFound);
    server.get<{ Params: { secret: string } }>('/:secret', () => 'ok');
    server.post('/:secret', () => {
        throw new Error('failed');
    });

    return {
        server,
        lines,
    };
}

describe('request logging', () => {
    it('logs the route pattern, not the secret in the path', async () => {
        const { server, lines } = createServerWithLogLines();

        await server.inject({
            method: 'GET',
            url: `/${SECRET}`,
        });

        const log = lines.join('');

        expect(log).toContain('"route":"/:secret"');
        expect(log).not.toContain(SECRET);
    });

    it('does not log the secret when a handler fails', async () => {
        const { server, lines } = createServerWithLogLines();

        const response = await server.inject({
            method: 'POST',
            url: `/${SECRET}`,
        });

        expect(response.statusCode).toBe(500);
        expect(lines.join('')).not.toContain(SECRET);
    });

    it('does not log the path of a request that matches no route', async () => {
        const { server, lines } = createServerWithLogLines();

        const response = await server.inject({
            method: 'GET',
            url: `/${SECRET}/extra`,
        });

        expect(response.statusCode).toBe(404);
        expect(lines.join('')).not.toContain(SECRET);
    });
});
