import Fastify from 'fastify';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { handleAlertmanagerWebhook } from './alerts/handleAlertmanagerWebhook';
import { sendDailyOverview } from './dailyOverview/sendDailyOverview';
import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';
import type { ObsidianSyncApi } from './obsidianSyncApi';
import { formatTorrentEvent, isTorrentEvent } from './qbittorrent/formatTorrentEvent';

/**
 * The routes that only the cluster itself may call: no ingress points at this server. They carry
 * no authentication and must never face the internet, above all /telegram/send-message, which
 * sends arbitrary messages with the bot token and would be an open relay if exposed. Its callers
 * address it as http://cluster-helper: alertmanager, qbittorrent's tg-notify.sh, vpn-subscription
 * and n8n. Do not merge it with the public server.
 */
export function createInternalServer({ obsidianSyncApi, isReady }: {
    obsidianSyncApi: Pick<ObsidianSyncApi, 'getMilestones'>;
    isReady: () => boolean;
}) {
    const server = Fastify({ loggerInstance: logger });

    server.get('/health/live', (_request, reply) => {
        reply.code(200).send({ status: 'ok' });
    });

    server.get('/health/ready', (_request, reply) => {
        if (!isReady()) {
            reply.code(503).send({ status: 'not-ready' });

            return;
        }

        reply.code(200).send({ status: 'ready' });
    });

    server.post<{ Body: unknown }>('/alertmanager/webhook', (request, reply) => {
        handleAlertmanagerWebhook(request.body);

        reply.code(204).send();
    });

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

    // Called once a day by the n8n `daily-overview` workflow. A GET with a side effect, so
    // that the scheduler needs no body; it is safe only because this port is internal.
    server.get<{ Querystring: { date?: string } }>('/send-daily-overview', async (request, reply) => {
        try {
            const { messageId, text } = await sendDailyOverview(obsidianSyncApi, request.query.date);

            logger.info({
                messageId,
                text,
            }, '✅ Daily overview sent');

            return reply.code(200).send({
                status: 'ok',
                messageId,
            });
        } catch (error) {
            logger.error(error, '❌ Failed to send daily overview');

            return reply.code(502).send({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    server.post<{ Body: unknown }>('/qbittorrent/torrent-event', async (request, reply) => {
        if (!isTorrentEvent(request.body)) {
            throw new Error('Invalid qBittorrent torrent event payload');
        }

        logger.info({
            event: request.body.event,
            name: request.body.name,
        }, '🆕 Received qBittorrent torrent event');

        await sendTelegramMessage({
            text: formatTorrentEvent(request.body),
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            token: TG_TOKEN_SENAEV_COM_BOT,
        });
        reply.code(204).send();
    });

    return server;
}
