import Fastify, { type FastifyInstance } from 'fastify';
import type { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import type { TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';

import type { ExecutionManager } from './executionManager';
import { logger } from './logger';
import { registerExecutionRoutes } from './registerExecutionRoutes';

export const PORT = 8443;

export function createNodeShellServer(credentials: Signal<TlsCredentials>, manager: Pick<ExecutionManager, 'start' | 'get' | 'stop'>) {
    const server = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials,
    });

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    registerExecutionRoutes(server as unknown as FastifyInstance, manager);

    return server;
}
