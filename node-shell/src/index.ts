import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';
import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { NODE_SHELL_LOCAL_HOST } from './env';
import { createExecutionManager, markInterruptedExecutions } from './executionManager';
import { loadExecutionRecords } from './executionRecords';
import { createExecutionStore } from './executionStore';
import { logger } from './logger';
import { createNodeShellServer, PORT } from './nodeShellServer';

// In the node folder that the pod mounts at /state.
const STATE_DIRECTORY = '/state/executions';
// Longer than the approval window and the longest command.
const RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ node-shell shutdown failed')
);

async function main(): Promise<void> {
    const records = await loadExecutionRecords({
        store: await createExecutionStore(STATE_DIRECTORY),
        logger,
    });
    const holds = markInterruptedExecutions(records, logger);

    const cleanUp = () => {
        records.removeOlderThan(RECORD_RETENTION_MS, new Date())
            .then((removed) => logger.info({ removed }, '🧹 Removed old node command records'))
            .catch((error: unknown) => logger.error(error, '❌ Failed to remove old node command records'));
    };

    cleanUp();

    const cleanupTimer = setInterval(cleanUp, CLEANUP_INTERVAL_MS);
    const manager = createExecutionManager({
        records,
        holds,
        logger,
    });
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
