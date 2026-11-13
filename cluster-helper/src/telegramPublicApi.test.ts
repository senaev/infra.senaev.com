import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, Mock, vi,
} from 'vitest';

import { TELEGRAM_PUBLIC_API_PATH, telegramPublicApi } from './telegramPublicApi';

const SECRET = 'public-api-secret-1234567890';
const TELEGRAM_API_BASE_URL = 'https://api.telegram.org/botbot-token-0987654321';

let server: FastifyInstance;
let fetchTelegram: Mock<typeof fetch>;
let logLines: string[];

function telegramAnswer(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function call({
    path = '/sendMessage',
    secret = SECRET,
    contentType = 'application/json',
    payload = '{}',
}: {
    path?: string;
    secret?: string | null;
    contentType?: string | null;
    payload?: string | null;
} = {}) {
    return server.inject({
        method: 'POST',
        url: `${TELEGRAM_PUBLIC_API_PATH}${path}`,
        headers: {
            ...(secret !== null && { authorization: `Bearer ${secret}` }),
            ...(contentType !== null && { 'content-type': contentType }),
        },
        ...(payload !== null && { payload }),
    });
}

function forwardedRequest() {
    const [
        url,
        init,
    ] = fetchTelegram.mock.calls[0] ?? [];

    return {
        url,
        method: init?.method,
        headers: init?.headers,
        body: init?.body,
    };
}

beforeEach(async () => {
    fetchTelegram = vi.fn<typeof fetch>().mockResolvedValue(telegramAnswer(200, {
        ok: true,
        result: { message_id: 1 },
    }));
    vi.stubGlobal('fetch', fetchTelegram);
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
        prefix: TELEGRAM_PUBLIC_API_PATH,
        secret: SECRET,
        telegramApiBaseUrl: TELEGRAM_API_BASE_URL,
    });
});

afterEach(async () => {
    await server.close();
    vi.unstubAllGlobals();
});

describe('telegramPublicApi', () => {
    it('answers 401 to a missing or wrong secret, and calls nothing', async () => {
        for (const secret of [
            null,
            'wrong-secret',
        ]) {
            const response = await call({ secret });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toMatchObject({ ok: false });
        }

        expect(fetchTelegram).not.toHaveBeenCalled();
    });

    it('answers 404 to a method name that is not letters only, and calls nothing', async () => {
        for (const path of [
            '/send-message',
            '/%2E%2E',
        ]) {
            const response = await call({ path });

            expect(response.statusCode, path).toBe(404);
        }

        expect(fetchTelegram).not.toHaveBeenCalled();
    });

    it('answers 415 to a body that is not JSON, and calls nothing', async () => {
        const response = await call({
            path: '/sendDocument',
            contentType: 'multipart/form-data; boundary=XyZ',
            payload: '--XyZ--\r\n',
        });

        expect(response.statusCode).toBe(415);
        expect(fetchTelegram).not.toHaveBeenCalled();
    });

    it('forwards the JSON body with the bot token, and returns the answer of Telegram', async () => {
        const body = {
            chat_id: '42',
            text: '*hello*',
            parse_mode: 'MarkdownV2',
        };
        const response = await call({ payload: JSON.stringify(body) });

        expect(forwardedRequest()).toMatchObject({
            url: `${TELEGRAM_API_BASE_URL}/sendMessage`,
            method: 'POST',
            headers: { 'content-type': 'application/json' },
        });
        expect(JSON.parse(String(forwardedRequest().body))).toEqual(body);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            ok: true,
            result: { message_id: 1 },
        });
    });

    it('forwards an empty object when the request has no body', async () => {
        await call({
            path: '/getMe',
            contentType: null,
            payload: null,
        });

        expect(forwardedRequest()).toMatchObject({
            url: `${TELEGRAM_API_BASE_URL}/getMe`,
            body: '{}',
        });
    });

    it('answers 413 to a body over the default Fastify limit of 1 MiB, and calls nothing', async () => {
        const response = await call({ payload: JSON.stringify({ text: 'a'.repeat(1024 * 1024) }) });

        expect(response.statusCode).toBe(413);
        expect(fetchTelegram).not.toHaveBeenCalled();
    });

    it('returns an error of Telegram unchanged', async () => {
        const error = {
            ok: false,
            error_code: 400,
            description: 'Bad Request: chat not found',
        };

        fetchTelegram.mockResolvedValue(telegramAnswer(400, error));

        const response = await call();

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual(error);
    });

    it('answers 502 when Telegram is unreachable', async () => {
        fetchTelegram.mockRejectedValue(new Error('fetch failed'));

        const response = await call();

        expect(response.statusCode).toBe(502);
        expect(response.json()).toMatchObject({ ok: false });
    });

    it('logs neither the secret, the bot token nor the body', async () => {
        const payload = '{"text":"private text"}';

        await call({ payload });
        await call({
            payload,
            secret: 'wrong-secret',
        });
        fetchTelegram.mockRejectedValue(new Error('fetch failed'));
        await call({ payload });

        const log = logLines.join('');

        expect(log).toContain('Telegram public API');
        expect(log).not.toContain(SECRET);
        expect(log).not.toContain('wrong-secret');
        expect(log).not.toContain('bot-token');
        expect(log).not.toContain('private text');
    });
});
