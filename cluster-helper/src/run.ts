import { randomBytes } from 'node:crypto';

import Fastify from 'fastify';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import { createMtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';
import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';
import { callTelegramApi } from 'senaev-utils/src/utils/TelegramApi/callTelegramApi';
import { getCurrentTelegramBotInfo } from 'senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo';

import { createInternalServer } from './createInternalServer';
import { createPublicServer, TELEGRAM_WEBHOOK_PATH } from './createPublicServer';
import {
    API_DOMAIN, OBSIDIAN_SYNC_URL, TG_TOKEN_SENAEV_COM_BOT,
} from './env';
import { logger } from './logger';
import { createObsidianSyncApi } from './obsidianSyncApi';
import { logStartupStep } from './startupTimer';
import { startTorrentOutboxProcessor } from './torrentOutbox';

const HOST = '0.0.0.0';

// Three listeners in one process, and they must stay separate.
//
// INTERNAL_PORT is reachable only from inside the cluster: no ingress points at it.
// PUBLIC_PORT is what the five ingresses target.
// MTLS_PORT accepts only services with a certificate of the internal CA. It has no routes and
// no caller yet. Before the first route, add a check of the allowed callers: see
// projects/2026-11-15-11-00-inter-service-certificate-authentication/README.md
const INTERNAL_PORT = 80;
const PUBLIC_PORT = 3000;
const MTLS_PORT = 8443;

/**
 * Starts the whole service and returns when it is up. The listeners keep the process alive.
 *
 * Nothing is kept in module state: `run` creates every part in order and passes each part to
 * the code that needs it. Each part subscribes with `subscribeShutdown` right after it exists,
 * so on SIGTERM or SIGINT the controller closes them in the reverse order of creation, one after
 * another and then exits: the servers first, so that the requests in progress can still use the
 * obsidian-sync client, then the client, then the certificate watcher. A failed start is thrown
 * to the caller, which exits with 1.
 */
export async function run(): Promise<void> {
    logStartupStep('modules loaded');

    const subscribeShutdown = createShutdownController(
        process,
        (error) => logger.error(error, '❌ Failed to close a part of the service')
    );
    let isReady = false;

    const certificates = await watchTlsCredentials({ logger });

    subscribeShutdown(() => certificates.stop());

    const obsidianSyncClient = createMtlsClient({
        origin: OBSIDIAN_SYNC_URL,
        credentials: certificates.credentials,
    });

    subscribeShutdown(() => obsidianSyncClient.close());

    const obsidianSyncApi = createObsidianSyncApi(obsidianSyncClient);

    logStartupStep('obsidian-sync client started');

    const botUser = await getCurrentTelegramBotInfo(TG_TOKEN_SENAEV_COM_BOT);

    logger.info({ botUser }, '✅ Bot user');
    logStartupStep('bot info fetched');

    const webhookSecretToken = randomBytes(32).toString('hex');
    const publicServer = await createPublicServer({
        obsidianSyncApi,
        botUser,
        webhookSecretToken,
    });

    logStartupStep('public routes registered');

    const internalServer = createInternalServer({
        obsidianSyncApi,
        isReady: () => isReady,
    });
    const mtlsServer = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials: certificates.credentials,
    });

    subscribeShutdown(() => Promise.all([
        internalServer.close(),
        publicServer.close(),
        mtlsServer.close(),
    ]));

    await startTorrentOutboxProcessor(subscribeShutdown);
    logger.info('✅ Torrent outbox processor started');
    logStartupStep('torrent outbox processor started');

    await internalServer.listen({
        port: INTERNAL_PORT,
        host: HOST,
    });
    logger.info({ port: INTERNAL_PORT }, '✅ Internal server listening');
    logStartupStep('internal server listening');

    await publicServer.listen({
        port: PUBLIC_PORT,
        host: HOST,
    });
    logger.info({ port: PUBLIC_PORT }, '✅ Public server listening');
    logStartupStep('public server listening');

    await mtlsServer.listen({
        port: MTLS_PORT,
        host: HOST,
    });
    logger.info({ port: MTLS_PORT }, '✅ mTLS server listening');
    logStartupStep('mtls server listening');

    // Ready as soon as all listeners are up, deliberately before setWebhook below.
    // Gating readiness on a Telegram call would let a Telegram outage drop this pod from
    // the Service endpoints, which would also cut off Alertmanager delivery on the
    // internal port. A hard setWebhook failure still exits and restarts the pod.
    isReady = true;
    logger.info('✅ Cluster helper is ready');
    // Subscribed last, so it runs first: the pod leaves the Service endpoints before any part closes.
    subscribeShutdown(() => {
        logger.info('🛑 Shutting down');
        isReady = false;
    });

    const webhookUrl = `https://${API_DOMAIN}${TELEGRAM_WEBHOOK_PATH}`;

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
    logStartupStep('webhook set');
}
