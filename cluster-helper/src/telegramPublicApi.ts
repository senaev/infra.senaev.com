import type { FastifyBaseLogger, FastifyPluginCallback } from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';

// A rich message takes up to 32768 characters; the rest is left for the prefix.
export const TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH = 32_000;
// On its own paragraph, so that a heading on the first line of the text stays a heading.
export const TELEGRAM_PUBLIC_API_MESSAGE_PREFIX = '📨\n\n';

// JSON can escape one character into up to 12 bytes (a surrogate pair as two \uXXXX).
const BODY_LIMIT_BYTES = TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH * 12 + 1024;

export type TelegramPublicApiOptions = {
    /** The secret path segment, without a leading slash. Anyone who does not know it gets 404. */
    path: string;
    sendMessage: (markdown: string) => Promise<unknown>;
    logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
};

function parseText(body: unknown): string | null {
    const text = isObject(body) ? body.text : undefined;

    // Telegram counts characters as code points, not UTF-16 units.
    if (typeof text !== 'string' || text.trim() === '' || Array.from(text).length > TELEGRAM_PUBLIC_API_MAX_TEXT_LENGTH) {
        return null;
    }

    return text;
}

/**
 * `POST /<secret path>` with `{ "text": "..." }` sends the text, as Telegram Rich Markdown,
 * to the owner's chat. Only the owner knows the path, so the Markdown is sent unchanged. It is for
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
            await sendMessage(`${TELEGRAM_PUBLIC_API_MESSAGE_PREFIX}${text}`);
        } catch (error) {
            logger.error({ error: error instanceof Error ? error.message : String(error) }, '❌ Telegram public API: failed to send the message');

            return reply.code(502).send({ error: 'Failed to send the message' });
        }

        logger.info({ length: text.length }, '📨 Telegram public API: message sent');

        return reply.code(204).send();
    });

    done();
};
