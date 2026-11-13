import type { FastifyPluginCallback } from 'fastify';

export const TELEGRAM_PUBLIC_API_PATH = '/telegram-public-bot-api';

// Bot API method names are letters only; anything else could change the upstream path.
const METHOD_NAME = /^[A-Za-z]+$/;

export type TelegramPublicApiOptions = {
    /** Clients send it as `Authorization: Bearer <secret>`. */
    secret: string;
    /** `https://api.telegram.org/bot<token>`: the proxy adds only the bot token. */
    telegramApiBaseUrl: string;
};

/**
 * A thin proxy to the Bot API of the senaev.com bot: `POST <prefix>/<method>` with a JSON body
 * goes to `<telegramApiBaseUrl>/<method>`, and Telegram's answer comes back unchanged. JSON only,
 * so local files cannot be uploaded; send them by URL or `file_id`. It is for the owner's scripts
 * outside the cluster and the tailnet. Every method is allowed, so the secret gives full control
 * of the bot.
 */
export const telegramPublicApi: FastifyPluginCallback<TelegramPublicApiOptions> = (instance, {
    secret, telegramApiBaseUrl,
}, done) => {
    // onRequest runs before the body is read, so an unauthenticated upload is not buffered.
    instance.addHook('onRequest', (request, reply, hookDone) => {
        if (request.headers.authorization !== `Bearer ${secret}`) {
            reply.code(401).send({
                ok: false,
                error_code: 401,
                description: 'Unauthorized',
            });

            return;
        }

        hookDone();
    });

    instance.post<{ Params: { method: string } }>('/:method', async (request, reply) => {
        const { method } = request.params;

        if (!METHOD_NAME.test(method)) {
            return reply.code(404).send();
        }

        const abortController = new AbortController();

        // `close` also comes after a normal end, when aborting changes nothing.
        reply.raw.on('close', () => abortController.abort());

        try {
            const response = await fetch(`${telegramApiBaseUrl}/${method}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                // A method with no parameters, such as getMe, may come with no body.
                body: JSON.stringify(request.body ?? {}),
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
    });

    done();
};
