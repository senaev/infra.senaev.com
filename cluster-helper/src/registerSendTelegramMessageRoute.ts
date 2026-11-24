import type {
    FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase,
} from 'fastify';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';

/**
 * Posts any message to any chat with the senaev.com bot, so it is an open relay for whoever can
 * reach it. Register it only on a server that the cluster itself reaches: the internal server,
 * and the mTLS server behind its caller allowlist.
 */
export function registerSendTelegramMessageRoute<RawServer extends RawServerBase, Logger extends FastifyBaseLogger>(server: Pick<FastifyInstance<RawServer, RawRequestDefaultExpression<RawServer>, RawReplyDefaultExpression<RawServer>, Logger>, 'post'>): void {
    server.post<{ Body: unknown }>('/telegram/send-message', async (request, reply) => {
        const message = request.body as Omit<Parameters<typeof sendTelegramMessage>[0], 'token'>;

        logger.info({
            chatId: message.chatId,
            textLength: message.text.length,
        }, '🆕 Received Telegram send message request');
        await sendTelegramMessage({
            ...message,
            token: TG_TOKEN_SENAEV_COM_BOT,
        });
        reply.code(204).send();
    });
}
