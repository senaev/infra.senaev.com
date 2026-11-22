import Fastify, { type FastifyInstance } from 'fastify';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import type { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import type { TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';

import { logger } from '../logger';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

import { registerProtectedCodeToolsRoutes } from './registerProtectedCodeToolsRoutes';

// code-write accepts up to 500,000 characters, which is up to about 2 MB of UTF-8 in JSON.
export const BODY_LIMIT_BYTES = 4 * 1024 * 1024;

export function createCodeToolsMtlsServer(credentials: Signal<TlsCredentials>, config: CodeToolsConfig) {
    const server = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials,
        bodyLimit: BODY_LIMIT_BYTES,
    });

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    registerProtectedCodeToolsRoutes(server as unknown as FastifyInstance, config);

    return server;
}
