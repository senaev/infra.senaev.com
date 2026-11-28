import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';
import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { NODE_SHELL_LOCAL_HOST } from './env';
import { ExecutionManager } from './executionManager';
import { logger } from './logger';
import { createNodeShellServer, PORT } from './nodeShellServer';

// Longer than the approval window and the longest command.
const RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ node-shell shutdown failed')
);

async function main(): Promise<void> {
    const manager = new ExecutionManager({ logger });
    const cleanUp = () => {
        const removed = manager.removeFinishedOlderThan(RECORD_RETENTION_MS, new Date());

        logger.info({ removed }, '🧹 Removed old node command records');
    };
    const cleanupTimer = setInterval(cleanUp, CLEANUP_INTERVAL_MS);
    const certificates = await watchTlsCredentials({ logger });
    const server = createNodeShellServer(certificates.credentials, manager);

    subscribeShutdown(() => {
        clearInterval(cleanupTimer);
        certificates.stop();
    });
    subscribeShutdown(() => server.close());

    await server.listen({
        port: PORT,
        host: '0.0.0.0',
    });
    logger.info({
        port: PORT,
        localHost: NODE_SHELL_LOCAL_HOST,
    }, '✅ node-shell listening');
}

// A failed start is an unhandled rejection: Node prints it and exits with 1.
void main();
