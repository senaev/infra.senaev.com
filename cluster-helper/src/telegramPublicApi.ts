import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyPluginCallback } from 'fastify';

export const TELEGRAM_PUBLIC_API_PATH = '/telegram-public-bot-api';

// The Bot API takes uploads of up to 50 MB.
const BODY_LIMIT_BYTES = 50 * 1024 * 1024;

// Bot API method names are letters only; anything else could change the upstream path.
const METHOD_NAME = /^[A-Za-z]+$/;

export type TelegramPublicApiOptions = {
    /** Clients send it as `Authorization: Bearer <secret>`. */
    secret: string;
    /** `https://api.telegram.org/bot<token>`: the proxy adds only the bot token. */
    telegramApiBaseUrl: string;
    fetch?: typeof fetch;
};

function sha256(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

/**
 * A thin proxy to the Bot API of the senaev.com bot: `GET|POST <prefix>/<method>` goes to
 * `<telegramApiBaseUrl>/<method>` with the same query, body and content type (JSON, form or
 * multipart), and Telegram's answer comes back unchanged. It is for the owner's scripts outside
 * the cluster and the tailnet. Every method is allowed, so the secret gives full control of the bot.
 */
export const telegramPublicApi: FastifyPluginCallback<TelegramPublicApiOptions> = (instance, {
    secret, telegramApiBaseUrl, fetch: fetchTelegram = fetch,
}, done) => {
    const secretHash = sha256(secret);

    // onRequest runs before the body is read, so an unauthenticated upload is not buffered.
    instance.addHook('onRequest', (request, reply, hookDone) => {
        const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];

        if (token === undefined || !timingSafeEqual(sha256(token), secretHash)) {
            reply.code(401).send({
                ok: false,
                error_code: 401,
                description: 'Unauthorized',
            });

            return;
        }

        hookDone();
    });

    instance.removeAllContentTypeParsers();
    instance.addContentTypeParser('*', {
        parseAs: 'buffer',
        bodyLimit: BODY_LIMIT_BYTES,
    }, (_request, body, parserDone) => parserDone(null, body));

    instance.route<{ Params: { method: string } }>({
        method: [
            'GET',
            'POST',
        ],
        url: '/:method',
        bodyLimit: BODY_LIMIT_BYTES,
        handler: async (request, reply) => {
            const { method } = request.params;

            if (!METHOD_NAME.test(method)) {
                return reply.code(404).send();
            }

            const queryStart = request.url.indexOf('?');
            const query = queryStart === -1 ? '' : request.url.slice(queryStart);
            const contentType = request.headers['content-type'];
            const abortController = new AbortController();

            // `close` also comes after a normal end, when aborting changes nothing.
            reply.raw.on('close', () => abortController.abort());

            try {
                const response = await fetchTelegram(`${telegramApiBaseUrl}/${method}${query}`, {
                    method: request.method,
                    ...(contentType !== undefined && { headers: { 'content-type': contentType } }),
                    // A Buffer is not a BodyInit: its store may be a SharedArrayBuffer.
                    ...(Buffer.isBuffer(request.body) && { body: new Uint8Array(request.body) }),
                    signal: abortController.signal,
                });

                request.log.info({
                    method,
                    status: response.status,
                }, '📨 Telegram public API call');

                return reply
                    .code(response.status)
                    .header('content-type', response.headers.get('content-type') ?? 'application/json')
                    .send(Buffer.from(await response.arrayBuffer()));
            } catch (error) {
                request.log.error({
                    method,
                    error: error instanceof Error ? error.message : String(error),
                }, '❌ Telegram public API: Telegram is unreachable');

                return reply.code(502).send({
                    ok: false,
                    error_code: 502,
                    description: 'Telegram API is unreachable',
                });
            }
        },
    });

    done();
};
