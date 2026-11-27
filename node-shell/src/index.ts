import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';
import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { LIST_NODES_ARGV } from './buildNodeCommand';
import {
    NODE_SHELL_LOCAL_HOST, NODE_SHELL_SSH_USER, NODE_SHELL_STATE_DIRECTORY,
} from './env';
import { createExecutionManager, markInterruptedExecutions } from './executionManager';
import { createExecutionStore } from './executionStore';
import { logger } from './logger';
import { createHostResolver, parseNodeList } from './nodeHosts';
import { createNodeShellServer, PORT } from './nodeShellServer';
import { runCommand } from './runCommand';

// Longer than the approval window and the longest command.
const RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const LIST_NODES_DEADLINE_MS = 30_000;
const LIST_NODES_MAX_OUTPUT_BYTES = 64 * 1024;

async function listClusterNodes(): Promise<string[]> {
    const result = await runCommand({
        argv: [...LIST_NODES_ARGV],
        deadlineMs: LIST_NODES_DEADLINE_MS,
        maxOutputBytes: LIST_NODES_MAX_OUTPUT_BYTES,
    });

    if (result.exitCode !== 0) {
        throw new Error(`kubectl get nodes failed with exit code ${String(result.exitCode)}: ${result.stderr.trim()}`);
    }

    const nodes = parseNodeList(result.stdout);

    logger.info({ nodes }, '🗂️ Read the cluster nodes');

    return nodes;
}

const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ node-shell shutdown failed')
);

async function main(): Promise<void> {
    const hosts = createHostResolver({
        localHost: NODE_SHELL_LOCAL_HOST,
        sshUser: NODE_SHELL_SSH_USER,
        listNodes: listClusterNodes,
    });
    const store = await createExecutionStore(NODE_SHELL_STATE_DIRECTORY);

    const busyUntil = await markInterruptedExecutions(store, logger);

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
        busyUntil,
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
