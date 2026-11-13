import type { FastifyBaseLogger, FastifyPluginCallback } from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { escapeTelegramMarkdown } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';

export const TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH = 2000;
export const TELEGRAM_PUBLIC_API_MESSAGE_PREFIX = '📨 ';

const BODY_LIMIT_BYTES = 16 * 1024;

export type TelegramPublicApiOptions = {
    /** The secret path segment, without a leading slash. Anyone who does not know it gets 404. */
    path: string;
    sendMessage: (text: string) => Promise<unknown>;
    logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
};

function parseText(body: unknown): string | null {
    const text = isObject(body) ? body.text : undefined;

    if (typeof text !== 'string' || text.trim() === '' || text.length > TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH) {
        return null;
    }

    return text;
}

/**
 * `POST /<secret path>` with `{ "text": "..." }` sends the text to the owner's chat. It is for
 * the owner's scripts outside the cluster and the tailnet, which cannot reach the internal
 * `/telegram/send-message` route.
 */
export const telegramPublicApi: FastifyPluginCallback<TelegramPublicApiOptions> = (instance, {
    path, sendMessage, logger,
}, done) => {
    // Fastify logs the URL of every request, and the URL here is the secret.
    instance.post(`/${path}`, {
        bodyLimit: BODY_LIMIT_BYTES,
        logLevel: 'silent',
    }, async (request, reply) => {
        const text = parseText(request.body);

        if (text === null) {
            logger.warn('⚠️ Telegram public API: invalid body');

            return reply.code(400).send({ error: `The body must be {"text": string}, 1-${TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH} characters` });
        }

        try {
            await sendMessage(`${TELEGRAM_PUBLIC_API_MESSAGE_PREFIX}${escapeTelegramMarkdown(text)}`);
        } catch (error) {
            logger.error({ error: error instanceof Error ? error.message : String(error) }, '❌ Telegram public API: failed to send the message');

            return reply.code(502).send({ error: 'Failed to send the message' });
        }

        logger.info({ length: text.length }, '📨 Telegram public API: message sent');

        return reply.code(204).send();
    });

    done();
};
