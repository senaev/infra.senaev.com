import { randomBytes } from 'node:crypto';

import Fastify from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { callTelegramApi } from 'senaev-utils/src/utils/TelegramApi/callTelegramApi';
import { getCurrentTelegramBotInfo } from 'senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { TelegramUpdate, TelegramUser } from 'senaev-utils/src/utils/TelegramApi/types';

import { handleAlertmanagerWebhook } from './alerts/handleAlertmanagerWebhook';
import {
    ALISA_WEBHOOK_SECRET, TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT, WEBHOOK_DOMAIN,
} from './env';
import { handleAlisaRequest } from './handleAlisaRequest';
import { logger } from './logger';
import { getShortLink } from './obsidianSyncApi';
import { processTelegramWebhookData } from './processTelegramWebhookData';
import { proxyPublicStaticFile } from './publicStaticProxy';
import { formatTorrentEvent, isTorrentEvent } from './qbittorrent/formatTorrentEvent';
import { startTorrentOutboxProcessor, stopTorrentOutboxProcessor } from './torrentOutbox';

const HOST = '0.0.0.0';

// Two listeners in one process, and they must stay separate.
//
// INTERNAL_PORT is reachable only from inside the cluster: no ingress points at it.
// It carries unauthenticated routes that must never face the internet, above all
// /telegram/send-message, which sends arbitrary messages with the bot token and would
// be an open relay if exposed. Its callers address it as http://cluster-helper:
// alertmanager, qbittorrent's tg-notify.sh, and vpn-subscription.
//
// PUBLIC_PORT is what the three ingresses target -- webhook-endpoint.senaev.com,
// s.senaev.com and static.senaev.com. Every route on it is either authenticated
// (Telegram secret token, Alisa secret path) or safe to publish, and the catch-all
// below answers 401 so nothing new leaks by accident.
//
// Serving both from one Fastify instance would publish the internal routes, so do not
// merge them.
export const INTERNAL_PORT = 80;
export const PUBLIC_PORT = 3000;

export const TELEGRAM_WEBHOOK_PATH = '/telegram-webhook';

export const webhookSecretToken = randomBytes(32).toString('hex');

const internalServer = Fastify({ loggerInstance: logger });
const publicServer = Fastify({ loggerInstance: logger });

let isReady = false;

internalServer.get('/health/live', (_request, reply) => {
    reply.code(200).send({ status: 'ok' });
});

internalServer.get('/health/ready', (_request, reply) => {
    if (!isReady) {
        reply.code(503).send({ status: 'not-ready' });

        return;
    }

    reply.code(200).send({ status: 'ready' });
});

internalServer.post<{ Body: unknown }>('/alertmanager/webhook', (request, reply) => {
    handleAlertmanagerWebhook(request.body);

    reply.code(204).send();
});

internalServer.post<{ Body: unknown }>('/telegram/send-message', async (request, reply) => {
    logger.info({ body: request.body }, '🆕 Received Telegram send message request');
    await sendTelegramMessage({
        ...(request.body as Omit<Parameters<typeof sendTelegramMessage>[0], 'token'>),
        token: TG_TOKEN_SENAEV_COM_BOT,
    });
    reply.code(204).send();
});

internalServer.post<{ Body: unknown }>('/qbittorrent/torrent-event', async (request, reply) => {
    logger.info({ body: request.body }, '🆕 Received qBittorrent torrent event');
    if (!isTorrentEvent(request.body)) {
        throw new Error('Invalid qBittorrent torrent event payload');
    }

    await sendTelegramMessage({
        text: formatTorrentEvent(request.body),
        chatId: TG_MEDIA_SERVER_CHAT_ID,
        parseMode: 'HTML',
        token: TG_TOKEN_SENAEV_COM_BOT,
    });
    reply.code(204).send();
});

publicServer.get('/healthz', (_request, reply) => reply.send('OK'));

// Backs the public short link redirector at https://s.senaev.com/<shortId>.
// The ingress for s.senaev.com rewrites "/<shortId>" to "/short_links/<shortId>"
// via a Traefik AddPrefix middleware before it reaches this app, so this route
// itself stays namespaced and doesn't need any host-based logic.
publicServer.get('/short_links/:shortId', async (request, reply) => {
    const { shortId } = request.params as { shortId: string };

    try {
        const targetUrl = await getShortLink(shortId);

        if (targetUrl === null) {
            return reply.code(404).send('Not Found');
        }

        return reply.redirect(targetUrl, 302);
    } catch (err: unknown) {
        logger.error(err, '❌ Error resolving short link');

        return reply.code(500).send('Internal Server Error');
    }
});

// Backs https://static.senaev.com, whose ingress rewrites "/<path>" to
// "/public-static/<path>" via a Traefik AddPrefix middleware, the same trick
// s.senaev.com uses above. The files live in the Obsidian vault, which only the
// ClusterIP-only obsidian-sync container can reach, so this route proxies to
// it. Registered before the catch-all below only for readability — Fastify
// matches the more specific route regardless of declaration order.
publicServer.get('/public-static/*', async (request, reply) => {
    const { '*': path } = request.params as { '*': string };

    try {
        const result = await proxyPublicStaticFile({
            path,
            requestHeaders: request.headers,
        });

        return reply.code(result.status).headers(result.headers).send(result.body);
    } catch (err: unknown) {
        logger.error(err, '❌ Error proxying public static file');

        return reply.code(502).type('text/plain').send('Bad Gateway');
    }
});

publicServer.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));

publicServer.post(`/${ALISA_WEBHOOK_SECRET}`, ({ body }, reply) => {
    const responseText = handleAlisaRequest(body as Record<string, unknown>);

    return reply.send({
        version: '1.0',
        response: {
            text: responseText,
            end_session: true,
        },
    });
});

async function main(): Promise<void> {
    const botUser: TelegramUser = await getCurrentTelegramBotInfo(TG_TOKEN_SENAEV_COM_BOT);

    logger.info({ botUser }, '✅ Bot user');

    publicServer.post(TELEGRAM_WEBHOOK_PATH, async (request, reply) => {
        try {
            logger.info({ update: request.body }, '🆕 Received Telegram update');
            const secret = request.headers['x-telegram-bot-api-secret-token'];

            if (secret !== webhookSecretToken) {
                logger.warn(
                    { path: TELEGRAM_WEBHOOK_PATH },
                    '⚠️ Unauthorized request with invalid secret token'
                );

                return reply.code(401).send('Unauthorized');
            }

            const update = request.body;

            if (!isObject(update)) {
                logger.warn(
                    {
                        path: TELEGRAM_WEBHOOK_PATH,
                        bodyType: typeof update,
                        body: update,
                    },
                    '⚠️ Invalid request with non-object body'
                );

                return reply.code(400).send('Bad Request');
            }

            await processTelegramWebhookData({
                botUser,
                update: update as TelegramUpdate,
            });

            logger.info('✅ Successfully processed Telegram update');

            return reply.send('OK');
        } catch (err: unknown) {
            logger.error(err, '❌ Error processing Telegram webhook data');

            // Telegram retries non-2xx webhook responses, so acknowledge after logging.
            return reply.send('OK');
        }
    });

    await startTorrentOutboxProcessor();
    logger.info('✅ Torrent outbox processor started');

    await internalServer.listen({
        port: INTERNAL_PORT,
        host: HOST,
    });
    logger.info({ port: INTERNAL_PORT }, '✅ Internal server listening');

    await publicServer.listen({
        port: PUBLIC_PORT,
        host: HOST,
    });
    logger.info({ port: PUBLIC_PORT }, '✅ Public server listening');

    // Ready as soon as both listeners are up, deliberately before setWebhook below.
    // Gating readiness on a Telegram call would let a Telegram outage drop this pod from
    // the Service endpoints, which would also cut off Alertmanager delivery on the
    // internal port. A hard setWebhook failure still exits and restarts the pod.
    isReady = true;
    logger.info('✅ Cluster helper is ready');

    const webhookUrl = `https://${WEBHOOK_DOMAIN}${TELEGRAM_WEBHOOK_PATH}`;

    await callTelegramApi({
        method: 'setWebhook',
        token: TG_TOKEN_SENAEV_COM_BOT,
        body: {
            url: webhookUrl,
            secret_token: webhookSecretToken,
            allowed_updates: [
                'message',
                'channel_post',
                'callback_query',
            ],
        },
    });
    logger.info({ webhookUrl }, '✅ Webhook set');
}

async function shutdown(): Promise<void> {
    logger.info('🛑 Shutting down');
    isReady = false;
    await Promise.all([
        internalServer.close(),
        publicServer.close(),
    ]);
    stopTorrentOutboxProcessor();
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err: unknown) => {
    logger.error(err, '❌ Failed to start server');
    process.exit(1);
});
