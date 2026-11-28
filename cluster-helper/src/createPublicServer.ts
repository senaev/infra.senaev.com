import Fastify, { type FastifyReply } from 'fastify';
import { ResourceReadGate } from 'senaev-utils/src/toolServer/ResourceReadGate';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { createTelegramApiBaseUrl } from 'senaev-utils/src/utils/TelegramApi/createTelegramApiBaseUrl';
import { escapeTelegramMarkdown } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { TelegramUpdate, TelegramUser } from 'senaev-utils/src/utils/TelegramApi/types';
import { isString } from 'senaev-utils/src/utils/String/isString';
import { isNumber } from 'senaev-utils/src/types/Number/Number';

import {
    describeMcpExchange, handleMcpMessage, McpServerOptions,
} from './chatGptMcp/handleMcpMessage';
import {
    createCodeToolFamily, createObsidianToolFamily, type ToolFamily,
} from './chatGptMcp/toolFamilies';
import type { CodeToolsApi } from './codeToolsApi';
import { describeTelegramUpdate } from './describeTelegramUpdate';
import {
    ALISA_ALLOWED_USER_IDS,
    AUTH_DOMAIN,
    AUTH_TOKEN_SIGNING_SECRET,
    GOOGLE_OAUTH_ADMIN_EMAILS,
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    MCP_DOMAIN,
    MCP_GRAFANA_URL,
    TELEGRAM_PUBLIC_API_SECRET,
    TG_CLUSTER_CHAT_ID,
    TG_TOKEN_SENAEV_COM_BOT,
} from './env';
import { logger } from './logger';
import { mcpEndpoints, mcpResources } from './mcpEndpoints';
import {
    createAuthorizationServer, LoginAttempt, MCP_SCOPE,
} from './oauth/authorizationServer';
import { createGoogleLogin, parseGoogleAdminEmails } from './oauth/googleLogin';
import { GOOGLE_CALLBACK_PATH } from './oauth/registerOAuthRoutes';
import type { ObsidianSyncApi } from './obsidianSyncApi';
import { processTelegramWebhookData } from './processTelegramWebhookData';
import { proxyPublicStaticFile } from './publicStaticProxy';
import { TELEGRAM_MCP_CHANNELS } from './telegramMcp/telegramMcpChannels';
import { createTelegramToolFamily } from './telegramMcp/telegramToolFamily';
import { TELEGRAM_PUBLIC_API_PATH, telegramPublicApi } from './telegramPublicApi';
import { handleAlisaRequest } from './trickyDad/handleAlisaRequest';
import { isAllowedAlisaRequest, parseAlisaAllowedUserIds } from './trickyDad/isAllowedAlisaRequest';

export const TELEGRAM_WEBHOOK_PATH = '/telegram-webhook';
const ALISA_WEBHOOK_PATH = '/alisa-webhook';

type LocalMcpServer = {
    families: readonly ToolFamily[];
    options: McpServerOptions;
    /** The message of the log line of every exchange. */
    logMessage: string;
};

const MCP_SECURITY_SCHEMES = [
    {
        type: 'oauth2',
        scopes: [MCP_SCOPE],
    },
];

const MAX_NOTIFIED_ACCOUNT_LENGTH = 100;

function notifyLoginAttempt({
    method, result, account,
}: LoginAttempt): void {
    logger.info({
        method,
        result,
    }, '🔑 OAuth sign-in attempt');

    const text = [
        result === 'success' ? '🔓 OAuth sign-in succeeded' : '⛔ OAuth sign-in denied',
        `Method: ${escapeTelegramMarkdown(method)}`,
        `Account: ${escapeTelegramMarkdown(account.slice(0, MAX_NOTIFIED_ACCOUNT_LENGTH))}`,
    ].join('\n');

    sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: TG_CLUSTER_CHAT_ID,
        text,
    }).catch((error: unknown) => {
        logger.error(error, '❌ Failed to send the OAuth sign-in notification');
    });
}

/**
 * The routes that the five ingresses target: api.senaev.com, auth.senaev.com, mcp.senaev.com,
 * s.senaev.com and static.senaev.com. Every route is either authenticated (Telegram secret token,
 * Alisa secret path or skill and user check, OAuth bearer tokens for the MCP endpoints,
 * the bearer secret of /telegram-public-bot-api), part of the OAuth flow, or
 * safe to publish, and the catch-all answers 401 so nothing new leaks by accident.
 *
 * Serving it together with the internal routes would publish them, so do not merge the two.
 */
export async function createPublicServer({
    obsidianSyncApi, codeToolsApi, botUser, webhookSecretToken,
}: {
    obsidianSyncApi: ObsidianSyncApi;
    codeToolsApi: CodeToolsApi;
    botUser: TelegramUser;
    webhookSecretToken: string;
}) {
    const server = Fastify({ loggerInstance: logger });

    server.get('/healthz', (_request, reply) => reply.send('OK'));

    // Backs the public short link redirector at https://s.senaev.com/<shortId>.
    // The ingress for s.senaev.com rewrites "/<shortId>" to "/short_links/<shortId>"
    // via a Traefik AddPrefix middleware before it reaches this app, so this route
    // itself stays namespaced and doesn't need any host-based logic.
    server.get('/short_links/:shortId', async (request, reply) => {
        const { shortId } = request.params as { shortId: string };

        try {
            const targetUrl = await obsidianSyncApi.getShortLink(shortId);

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
    server.get('/public-static/*', async (request, reply) => {
        const { '*': path } = request.params as { '*': string };

        try {
            const result = await proxyPublicStaticFile({
                obsidianSyncApi,
                path,
                requestHeaders: request.headers,
            });

            return reply.code(result.status).headers(result.headers).send(result.body);
        } catch (err: unknown) {
            logger.error(err, '❌ Error proxying public static file');

            return reply.code(502).type('text/plain').send('Bad Gateway');
        }
    });

    server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));

    const alisaAllowedUserIds = parseAlisaAllowedUserIds(ALISA_ALLOWED_USER_IDS);

    server.post(ALISA_WEBHOOK_PATH, ({ body }, reply) => {
        if (!isAllowedAlisaRequest(body, alisaAllowedUserIds)) {
            logger.warn('⛔ Rejected Alisa request from an unknown skill or user');

            return reply.code(401).send('Unauthorized');
        }

        return reply.send({
            version: '1.0',
            response: {
                text: handleAlisaRequest(body, obsidianSyncApi),
                end_session: true,
            },
        });
    });

    server.post(TELEGRAM_WEBHOOK_PATH, (request, reply) => {
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
                },
                '⚠️ Invalid request with non-object body'
            );

            return reply.code(400).send('Bad Request');
        }

        logger.info(describeTelegramUpdate(update), '🆕 Received Telegram update');

        // Telegram waits about a minute for this response and redelivers the same update
        // when it does not arrive. A Prowlarr search can outlast that by minutes, and every
        // redelivery used to start its own search, so one request answered the chat several
        // times. Acknowledge first and process detached: Telegram gets its 200 straight away
        // and the work takes as long as it takes.
        void processTelegramWebhookData({
            botUser,
            update: update as TelegramUpdate,
            obsidianSyncApi,
        }).then(
            () => {
                logger.info('✅ Successfully processed Telegram update');
            },
            (err: unknown) => {
                // Datadog ignores the numeric pino level and shows every line as info; it reads `status` first.
                logger.error({
                    err,
                    status: 'error',
                }, '❌ Error processing Telegram webhook data');
            }
        );

        return reply.send('OK');
    });

    // Three MCP servers, each on its own endpoint. The obsidian-* tools are forwarded to obsidian-sync,
    // which does all vault work, the code-* tools to code-tools, and the
    // telegram-* tools post with the senaev.com bot to the chats of TELEGRAM_MCP_CHANNELS.
    const obsidianMcpServer: LocalMcpServer = {
        families: [
            createObsidianToolFamily({
                readVaultResource: obsidianSyncApi.readVaultResource,
                callVaultTool: obsidianSyncApi.callVaultTool,
            }),
        ],
        options: {
            serverName: 'senaev-obsidian',
            securitySchemes: MCP_SECURITY_SCHEMES,
        },
        logMessage: '📓 Obsidian MCP message',
    };
    const codeMcpServer: LocalMcpServer = {
        families: [createCodeToolFamily({ callCodeTool: codeToolsApi.callCodeTool })],
        options: {
            serverName: 'senaev-code',
            securitySchemes: MCP_SECURITY_SCHEMES,
        },
        logMessage: '🧑‍💻 Code MCP message',
    };
    const telegramMcpServer: LocalMcpServer = {
        families: [
            createTelegramToolFamily({
                channels: TELEGRAM_MCP_CHANNELS,
                sendMarkdown: ({ chatId, text }) => sendTelegramMessage({
                    chatId,
                    text,
                    token: TG_TOKEN_SENAEV_COM_BOT,
                }),
            }),
        ],
        options: {
            serverName: 'senaev-telegram',
            securitySchemes: MCP_SECURITY_SCHEMES,
        },
        logMessage: '✉️ Telegram MCP message',
    };
    const resourceReads = new ResourceReadGate();

    async function replyToMcpMessage(message: unknown, reply: FastifyReply, {
        families, options, logMessage,
    }: LocalMcpServer) {
        const isResourceRead = isObject(message) && message.method === 'resources/read';
        const transfer = isResourceRead ? resourceReads.begin(reply.raw, 65_000) : null;

        if (isResourceRead && transfer === null) {
            return reply.code(429).header('Retry-After', '1').send({
                jsonrpc: '2.0',
                id: isString(message.id) || isNumber(message.id) ? message.id : null,
                error: {
                    code: -32000,
                    message: 'Another file transfer is active; retry shortly',
                },
            });
        }

        try {
            const response = await handleMcpMessage(message, families, {
                ...options,
                ...transfer !== null && { signal: transfer.signal },
            });

            logger.info(describeMcpExchange(message, response), logMessage);

            if (response === null) {
                return reply.code(202).send();
            }

            return reply.code(200).send(response);
        } catch (error) {
            logger.error({
                err: error,
                server: options.serverName,
            }, '❌ Failed to handle an MCP message');

            return reply.code(500).send({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32603,
                    message: 'Internal error',
                },
            });
        } finally {
            transfer?.finish();
        }
    }

    const googleAdminEmails = parseGoogleAdminEmails(GOOGLE_OAUTH_ADMIN_EMAILS);
    const authorizationServer = createAuthorizationServer({
        issuer: `https://${AUTH_DOMAIN}`,
        resources: mcpResources(MCP_DOMAIN),
        signingSecret: AUTH_TOKEN_SIGNING_SECRET,
        googleAdminEmails,
    });
    const googleLogin = createGoogleLogin({
        clientId: GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
        redirectUri: `https://${AUTH_DOMAIN}${GOOGLE_CALLBACK_PATH}`,
        adminEmails: googleAdminEmails,
        transactionSecret: AUTH_TOKEN_SIGNING_SECRET,
    });

    await server.register(mcpEndpoints, {
        authorizationServer,
        googleLogin,
        onLoginAttempt: notifyLoginAttempt,
        authDomain: AUTH_DOMAIN,
        mcpDomain: MCP_DOMAIN,
        replyToObsidianMessage: (message, reply) => replyToMcpMessage(message, reply, obsidianMcpServer),
        replyToCodeMessage: (message, reply) => replyToMcpMessage(message, reply, codeMcpServer),
        replyToTelegramMessage: (message, reply) => replyToMcpMessage(message, reply, telegramMcpServer),
        grafanaUpstreamUrl: MCP_GRAFANA_URL,
    });

    await server.register(telegramPublicApi, {
        prefix: TELEGRAM_PUBLIC_API_PATH,
        secret: TELEGRAM_PUBLIC_API_SECRET,
        telegramApiBaseUrl: createTelegramApiBaseUrl(TG_TOKEN_SENAEV_COM_BOT),
    });

    return server;
}
