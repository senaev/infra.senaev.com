import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, Mock, vi,
} from 'vitest';

import { telegramPublicApi } from './telegramPublicApi';

const SECRET_PATH = 'secret-path-1234567890';
const TELEGRAM_API_BASE_URL = 'https://api.telegram.org/botsecret-token';

let server: FastifyInstance;
let fetchTelegram: Mock<typeof fetch>;
let logLines: string[];

function telegramAnswer(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
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
        body: init?.body === undefined ? undefined : Buffer.from(init.body as Uint8Array).toString(),
    };
}

beforeEach(async () => {
    fetchTelegram = vi.fn<typeof fetch>().mockResolvedValue(telegramAnswer(200, {
        ok: true,
        result: { message_id: 1 },
    }));
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
        telegramApiBaseUrl: TELEGRAM_API_BASE_URL,
        logger: server.log,
        fetch: fetchTelegram,
    });
});

afterEach(async () => {
    await server.close();
});

describe('telegramPublicApi', () => {
    it('answers 404 to a wrong path or a method name that is not letters only, and calls nothing', async () => {
        for (const url of [
            '/wrong-path/sendMessage',
            `/${SECRET_PATH}`,
            `/${SECRET_PATH}/send-message`,
            `/${SECRET_PATH}/%2E%2E`,
        ]) {
            const response = await server.inject({
                method: 'POST',
                url,
                headers: { 'content-type': 'application/json' },
                payload: '{}',
            });

            expect(response.statusCode, url).toBe(404);
        }

        expect(fetchTelegram).not.toHaveBeenCalled();
    });

    it('forwards a JSON POST unchanged with the bot token, and returns the answer of Telegram', async () => {
        const payload = JSON.stringify({
            chat_id: '42',
            text: '*hello*',
            parse_mode: 'MarkdownV2',
        });
        const response = await server.inject({
            method: 'POST',
            url: `/${SECRET_PATH}/sendMessage`,
            headers: { 'content-type': 'application/json' },
            payload,
        });

        expect(forwardedRequest()).toEqual({
            url: `${TELEGRAM_API_BASE_URL}/sendMessage`,
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: payload,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            ok: true,
            result: { message_id: 1 },
        });
    });

    it('forwards a multipart body byte for byte', async () => {
        const contentType = 'multipart/form-data; boundary=XyZ';
        const payload = '--XyZ\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n42\r\n--XyZ--\r\n';

        await server.inject({
            method: 'POST',
            url: `/${SECRET_PATH}/sendDocument`,
            headers: { 'content-type': contentType },
            payload,
        });

        expect(forwardedRequest()).toMatchObject({
            url: `${TELEGRAM_API_BASE_URL}/sendDocument`,
            headers: { 'content-type': contentType },
            body: payload,
        });
    });

    it('forwards a GET with its query and no body', async () => {
        await server.inject({
            method: 'GET',
            url: `/${SECRET_PATH}/getChat?chat_id=42`,
        });

        expect(forwardedRequest()).toEqual({
            url: `${TELEGRAM_API_BASE_URL}/getChat?chat_id=42`,
            method: 'GET',
            headers: undefined,
            body: undefined,
        });
    });

    it('returns an error of Telegram unchanged', async () => {
        const error = {
            ok: false,
            error_code: 400,
            description: 'Bad Request: chat not found',
        };

        fetchTelegram.mockResolvedValue(telegramAnswer(400, error));

        const response = await server.inject({
            method: 'POST',
            url: `/${SECRET_PATH}/sendMessage`,
            headers: { 'content-type': 'application/json' },
            payload: '{}',
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual(error);
    });

    it('answers 502 when Telegram is unreachable', async () => {
        fetchTelegram.mockRejectedValue(new Error('fetch failed'));

        const response = await server.inject({
            method: 'POST',
            url: `/${SECRET_PATH}/sendMessage`,
            headers: { 'content-type': 'application/json' },
            payload: '{}',
        });

        expect(response.statusCode).toBe(502);
        expect(response.json()).toMatchObject({ ok: false });
    });

    it('logs neither the secret path, the token nor the body', async () => {
        const send = () => server.inject({
            method: 'POST',
            url: `/${SECRET_PATH}/sendMessage`,
            headers: { 'content-type': 'application/json' },
            payload: '{"text":"private text"}',
        });

        await send();
        fetchTelegram.mockRejectedValue(new Error('fetch failed'));
        await send();

        const log = logLines.join('');

        expect(log).toContain('Telegram public API');
        expect(log).not.toContain(SECRET_PATH);
        expect(log).not.toContain('secret-token');
        expect(log).not.toContain('private text');
    });
});
