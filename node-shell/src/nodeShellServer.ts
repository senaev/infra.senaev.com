import Fastify, { type FastifyInstance } from 'fastify';
import type { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import type { TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';

import type { ExecutionManager } from './executionManager';
import { logger } from './logger';
import { registerExecutionRoutes } from './registerExecutionRoutes';

export const PORT = 8443;

/**
 * The only listener of node-shell. There is no plain HTTP port and no probe: the only caller is
 * cluster-helper, and nothing else may reach a service that is root on every node.
 */
export function createNodeShellServer(credentials: Signal<TlsCredentials>, manager: ExecutionManager) {
    const server = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials,
    });

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    registerExecutionRoutes(server as unknown as FastifyInstance, manager);

    return server;
}
