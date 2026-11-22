import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';
import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import {
    NODE_SHELL_LOCAL_HOST, NODE_SHELL_SSH_DESTINATIONS, NODE_SHELL_STATE_DIRECTORY,
} from './env';
import { createExecutionManager, markInterruptedExecutions } from './executionManager';
import { createExecutionStore } from './executionStore';
import { logger } from './logger';
import { parseNodeHosts } from './nodeHosts';
import { createNodeShellServer, PORT } from './nodeShellServer';
import { runCommand } from './runCommand';

// Longer than the 10-minute approval and the 1-hour longest command, so a repeated request with
// the same ID still finds its record. Then the caller has long had the result.
const RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ node-shell shutdown failed')
);

async function main(): Promise<void> {
    const hosts = parseNodeHosts(NODE_SHELL_LOCAL_HOST, NODE_SHELL_SSH_DESTINATIONS);
    const store = await createExecutionStore(NODE_SHELL_STATE_DIRECTORY);

    await markInterruptedExecutions(store, logger);

    const cleanUp = () => {
        store.removeOlderThan(RECORD_RETENTION_MS, new Date())
            .then((removed) => logger.info({ removed }, '🧹 Removed old node command records'))
            .catch((error: unknown) => logger.error(error, '❌ Failed to remove old node command records'));
    };

    cleanUp();

    const cleanupTimer = setInterval(cleanUp, CLEANUP_INTERVAL_MS);
    const manager = createExecutionManager({
        store,
        hosts,
        run: runCommand,
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
        localHost: hosts.localHost,
        sshHosts: [...hosts.sshDestinations.keys()],
    }, '✅ node-shell listening');
}

// A failed start is an unhandled rejection: Node prints it and exits with 1.
void main();
