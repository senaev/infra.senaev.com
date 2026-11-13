import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, Mock, vi,
} from 'vitest';

import {
    TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH, TELEGRAM_PUBLIC_API_MESSAGE_PREFIX, telegramPublicApi,
} from './telegramPublicApi';

const SECRET_PATH = 'secret-path-1234567890';

let server: FastifyInstance;
let sendMessage: Mock<(text: string) => Promise<unknown>>;
let logLines: string[];

function post(path: string, body: unknown) {
    return server.inject({
        method: 'POST',
        url: `/${path}`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify(body),
    });
}

beforeEach(async () => {
    sendMessage = vi.fn<(text: string) => Promise<unknown>>().mockResolvedValue(undefined);
    logLines = [];
    server = Fastify({
        logger: {
            level: 'info',
            stream: { write: (line: string) => logLines.push(line) },
        },
    });
    // Same catch-all as the public server.
    server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));
    await server.register(telegramPublicApi, {
        path: SECRET_PATH,
        sendMessage,
        logger: server.log,
    });
});

afterEach(async () => {
    await server.close();
});

describe('telegramPublicApi', () => {
    it('answers 404 to a wrong path and sends nothing', async () => {
        const response = await post('wrong-path', { text: 'hello' });

        expect(response.statusCode).toBe(404);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('answers 400 to a bad body and sends nothing', async () => {
        for (const body of [
            null,
            'hello',
            {},
            { text: 42 },
            { text: '   ' },
            { text: 'a'.repeat(TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH + 1) },
        ]) {
            const response = await post(SECRET_PATH, body);

            expect(response.statusCode).toBe(400);
        }

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('sends the text with the prefix and escaped Markdown, and answers 204', async () => {
        const response = await post(SECRET_PATH, { text: 'work-log: *needs* sign-in' });

        expect(response.statusCode).toBe(204);
        expect(sendMessage).toHaveBeenCalledExactlyOnceWith(`${TELEGRAM_PUBLIC_API_MESSAGE_PREFIX}work\\-log: \\*needs\\* sign\\-in`);
    });

    it('accepts a text of the maximum length', async () => {
        const response = await post(SECRET_PATH, { text: 'a'.repeat(TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH) });

        expect(response.statusCode).toBe(204);
    });

    it('answers 502 when Telegram fails', async () => {
        sendMessage.mockRejectedValue(new Error('Telegram is down'));

        const response = await post(SECRET_PATH, { text: 'hello' });

        expect(response.statusCode).toBe(502);
    });

    it('logs neither the secret path nor the text', async () => {
        await post(SECRET_PATH, { text: 'private text' });
        await post(SECRET_PATH, {});
        sendMessage.mockRejectedValue(new Error('Telegram is down'));
        await post(SECRET_PATH, { text: 'private text' });

        const log = logLines.join('');

        expect(log).toContain('Telegram public API');
        expect(log).not.toContain(SECRET_PATH);
        expect(log).not.toContain('private text');
    });
});
