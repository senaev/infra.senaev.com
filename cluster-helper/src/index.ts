import { randomBytes } from 'node:crypto';

import Fastify, { FastifyReply } from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { callTelegramApi } from 'senaev-utils/src/utils/TelegramApi/callTelegramApi';
import { getCurrentTelegramBotInfo } from 'senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { TelegramUpdate, TelegramUser } from 'senaev-utils/src/utils/TelegramApi/types';

import { handleAlertmanagerWebhook } from './alerts/handleAlertmanagerWebhook';
import {
    describeMcpExchange, handleMcpMessage, McpServerOptions,
} from './chatGptMcp/handleMcpMessage';
import { sendDailyOverview } from './dailyOverview/sendDailyOverview';
import {
    ALISA_WEBHOOK_SECRET,
    AUTH_DOMAIN,
    AUTH_MY_PASSWORD,
    AUTH_MY_USERNAME,
    AUTH_TOKEN_SIGNING_SECRET,
    MCP_DOMAIN,
    TG_MEDIA_SERVER_CHAT_ID,
    TG_TOKEN_SENAEV_COM_BOT,
    WEBHOOK_DOMAIN,
} from './env';
import { handleAlisaRequest } from './handleAlisaRequest';
import { logger } from './logger';
import { createAuthorizationServer, MCP_SCOPE } from './oauth/authorizationServer';
import { oauthRoutes } from './oauth/registerOAuthRoutes';
import { appendDailyNoteDraft, getShortLink } from './obsidianSyncApi';
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
// PUBLIC_PORT is what the five ingresses target -- webhook-endpoint.senaev.com,
// auth.senaev.com, mcp.senaev.com, s.senaev.com and static.senaev.com. Every route on it is either
// authenticated (Telegram secret token, Alisa secret path, OAuth bearer tokens for the
// ChatGPT MCP endpoint), part of the OAuth flow, or safe to publish, and the catch-all
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

// Called once a day by the n8n `daily-overview` workflow. A GET with a side effect, so
// that the scheduler needs no body; it is safe only because this port is internal.
internalServer.get<{ Querystring: { date?: string } }>('/send-daily-overview', async (request, reply) => {
    try {
        const { messageId, text } = await sendDailyOverview(request.query.date);

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

// MCP server for the ChatGPT connector. It writes the received text as-is to the daily
// note draft file in the Obsidian vault via obsidian-sync.
async function replyToMcpMessage(message: unknown, reply: FastifyReply, options: McpServerOptions) {
    try {
        const response = await handleMcpMessage(message, appendDailyNoteDraft, options);

        logger.info(describeMcpExchange(message, response), '🤖 ChatGPT MCP message');

        if (response === null) {
            return reply.code(202).send();
        }

        return reply.code(200).send(response);
    } catch (error) {
        logger.error(error, '❌ Failed to handle ChatGPT MCP message');

        return reply.code(500).send({
            jsonrpc: '2.0',
            id: null,
            error: {
                code: -32603,
                message: 'Internal error',
            },
        });
    }
}

// OAuth-protected MCP endpoint. The authorization server is on AUTH_DOMAIN; this endpoint
// on MCP_DOMAIN is the protected resource that the tokens are issued for.
const MCP_PATH = '/chat-gpt';
const MCP_RESOURCE = `https://${MCP_DOMAIN}${MCP_PATH}`;
const MCP_RESOURCE_METADATA_URL = `https://${MCP_DOMAIN}/.well-known/oauth-protected-resource${MCP_PATH}`;
const MCP_SERVER_OPTIONS: McpServerOptions = {
    securitySchemes: [
        {
            type: 'oauth2',
            scopes: [MCP_SCOPE],
        },
    ],
};

const authorizationServer = createAuthorizationServer({
    issuer: `https://${AUTH_DOMAIN}`,
    resource: MCP_RESOURCE,
    username: AUTH_MY_USERNAME,
    password: AUTH_MY_PASSWORD,
    signingSecret: AUTH_TOKEN_SIGNING_SECRET,
});

publicServer.post<{ Body: unknown }>(MCP_PATH, { constraints: { host: MCP_DOMAIN } }, async (request, reply) => {
    const check = await authorizationServer.checkAccessToken(request.headers.authorization);

    if (check.kind !== 'valid') {
        // The challenge points the client at the resource metadata, which is how ChatGPT
        // finds the authorization server and starts the OAuth flow.
        const error = check.kind === 'invalid' ? ', error="invalid_token"' : '';

        return reply
            .code(401)
            .header('WWW-Authenticate', `Bearer resource_metadata="${MCP_RESOURCE_METADATA_URL}", scope="${MCP_SCOPE}"${error}`)
            .send({ error: 'unauthorized' });
    }

    return replyToMcpMessage(request.body, reply, MCP_SERVER_OPTIONS);
});

// No server-initiated SSE stream: the transport spec says to answer GET with 405.
publicServer.get(MCP_PATH, { constraints: { host: MCP_DOMAIN } }, (_request, reply) => reply.code(405).header('Allow', 'POST').send());

async function main(): Promise<void> {
    const botUser: TelegramUser = await getCurrentTelegramBotInfo(TG_TOKEN_SENAEV_COM_BOT);

    logger.info({ botUser }, '✅ Bot user');

    publicServer.post(TELEGRAM_WEBHOOK_PATH, (request, reply) => {
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

        // Telegram waits about a minute for this response and redelivers the same update
        // when it does not arrive. A Prowlarr search can outlast that by minutes, and every
        // redelivery used to start its own search, so one request answered the chat several
        // times. Acknowledge first and process detached: Telegram gets its 200 straight away
        // and the work takes as long as it takes.
        void processTelegramWebhookData({
            botUser,
            update: update as TelegramUpdate,
        }).then(
            () => {
                logger.info('✅ Successfully processed Telegram update');
            },
            (err: unknown) => {
                logger.error(err, '❌ Error processing Telegram webhook data');
            }
        );

        return reply.send('OK');
    });

    await publicServer.register(oauthRoutes, {
        authorizationServer,
        authDomain: AUTH_DOMAIN,
        mcpDomain: MCP_DOMAIN,
        mcpPath: MCP_PATH,
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
