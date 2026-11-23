import type {
    FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase,
} from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { replaceWikiLinksWithHighlights } from 'senaev-utils/src/obsidianMarkdown/replaceWikiLinksWithHighlights';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';

type SendTelegramMessageBody = Omit<Parameters<typeof sendTelegramMessage>[0], 'token'> & {
    /** Steps that cluster-helper runs on the message before sending it; not part of the Telegram API. */
    preprocess?: {
        /** `highlight` turns Obsidian `[[links]]` in the text into highlights, as in the Telegram posts of notes. */
        wikiLinks?: 'highlight';
    };
};

/**
 * Posts any message to any chat with the senaev.com bot, so it is an open relay for whoever can
 * reach it. Register it only on a server that the cluster itself reaches: the internal server,
 * and the mTLS server behind its caller allowlist.
 */
export function registerSendTelegramMessageRoute<RawServer extends RawServerBase, Logger extends FastifyBaseLogger>(server: Pick<FastifyInstance<RawServer, RawRequestDefaultExpression<RawServer>, RawReplyDefaultExpression<RawServer>, Logger>, 'post'>): void {
    server.post<{ Body: unknown }>('/telegram/send-message', async (request, reply) => {
        const {
            preprocess, ...message
        } = request.body as SendTelegramMessageBody;

        if (preprocess !== undefined && !isObject(preprocess)) {
            reply.code(400).send({ error: 'preprocess must be an object or absent' });

            return;
        }

        const wikiLinks = preprocess?.wikiLinks;

        if (wikiLinks !== undefined && wikiLinks !== 'highlight') {
            reply.code(400).send({ error: 'preprocess.wikiLinks must be "highlight" or absent' });

            return;
        }

        logger.info({
            chatId: message.chatId,
            textLength: message.text.length,
            wikiLinks,
        }, '🆕 Received Telegram send message request');
        await sendTelegramMessage({
            ...message,
            text: wikiLinks === 'highlight' ? replaceWikiLinksWithHighlights(message.text) : message.text,
            token: TG_TOKEN_SENAEV_COM_BOT,
        });
        reply.code(204).send();
    });
}
