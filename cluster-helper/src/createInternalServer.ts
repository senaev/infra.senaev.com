import Fastify from 'fastify';
import { createHealthServer } from 'senaev-utils/src/utils/http/createHealthServer';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import type { AlertingHeartbeatMonitor } from './alerts/alertingHeartbeatMonitor';
import { handleAlertmanagerWebhook } from './alerts/handleAlertmanagerWebhook';
import { sendDailyOverview } from './dailyOverview/sendDailyOverview';
import {
    JOB_SEARCH_FRAMEWORK_CHAT_ID, TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT,
} from './env';
import { logger } from './logger';
import type { ObsidianSyncApi } from './obsidianSyncApi';
import { formatTorrentEvent, isTorrentEvent } from './qbittorrent/formatTorrentEvent';
import { registerJobSearchRoundReportRoute } from './registerJobSearchRoundReportRoute';
import { registerSendTelegramMessageRoute } from './registerSendTelegramMessageRoute';

/**
 * The routes that only the cluster itself may call: no ingress points at this server. They carry
 * no authentication and must never face the internet, above all /telegram/send-message, which
 * sends arbitrary messages with the bot token and would be an open relay if exposed. Its callers
 * address it as http://cluster-helper: alertmanager, qbittorrent's tg-notify.sh and n8n.
 * vpn-subscription calls the same route over mTLS. Do not merge it with the public server.
 */
export function createInternalServer({
    obsidianSyncApi, alertingHeartbeatMonitor, isReady,
}: {
    obsidianSyncApi: Pick<ObsidianSyncApi, 'getMilestones' | 'addJobSearchRecommendations'>;
    alertingHeartbeatMonitor: Pick<AlertingHeartbeatMonitor, 'recordHeartbeat'>;
    isReady: () => boolean;
}) {
    const server = createHealthServer({
        Fastify,
        logger,
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

    // Alertmanager posts the always-firing `alerting-heartbeat` alert here about once a minute. The
    // body is not read: any call proves that vmagent, VMSingle, vmalert and Alertmanager work.
    server.post('/alertmanager/heartbeat', async (_request, reply) => {
        await alertingHeartbeatMonitor.recordHeartbeat();

        reply.code(204).send();
    });

    registerSendTelegramMessageRoute(server);

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

    // Called by the n8n `job-search-round` workflow once a round has ended.
    registerJobSearchRoundReportRoute(server, {
        sendTelegramMessage: (text) => sendTelegramMessage({
            text,
            chatId: JOB_SEARCH_FRAMEWORK_CHAT_ID,
            token: TG_TOKEN_SENAEV_COM_BOT,
        }),
        addToRecommendationsLog: (report) => obsidianSyncApi.addJobSearchRecommendations(report),
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
