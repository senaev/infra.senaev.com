import type { FastifyBaseLogger, FastifyPluginCallback } from 'fastify';

// The Bot API takes uploads of up to 50 MB.
const BODY_LIMIT_BYTES = 50 * 1024 * 1024;

// Bot API method names are letters only; anything else could change the upstream path.
const METHOD_NAME = /^[A-Za-z]+$/;

export type TelegramPublicApiOptions = {
    /** The secret path segment, without a leading slash. Anyone who does not know it gets 404. */
    path: string;
    /** `https://api.telegram.org/bot<token>`: the proxy adds only the bot token. */
    telegramApiBaseUrl: string;
    logger: Pick<FastifyBaseLogger, 'info' | 'error'>;
    fetch?: typeof fetch;
};

/**
 * A thin proxy to the Bot API of the senaev.com bot: `GET|POST /<secret path>/<method>` goes to
 * `<telegramApiBaseUrl>/<method>` with the same query, body and content type (JSON, form or
 * multipart), and Telegram's answer comes back unchanged. It is for the owner's scripts outside
 * the cluster and the tailnet. Every method is allowed, so the path gives full control of the bot.
 */
export const telegramPublicApi: FastifyPluginCallback<TelegramPublicApiOptions> = (instance, {
    path, telegramApiBaseUrl, logger, fetch: fetchTelegram = fetch,
}, done) => {
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
        url: `/${path}/:method`,
        bodyLimit: BODY_LIMIT_BYTES,
        // Fastify logs the URL of every request, and the URL here holds the secret.
        logLevel: 'silent',
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

                logger.info({
                    method,
                    status: response.status,
                }, '📨 Telegram public API call');

                return reply
                    .code(response.status)
                    .header('content-type', response.headers.get('content-type') ?? 'application/json')
                    .send(Buffer.from(await response.arrayBuffer()));
            } catch (error) {
                logger.error({
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
