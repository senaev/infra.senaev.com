import Fastify, { type FastifyBaseLogger } from 'fastify';
import { createMtlsServerOptions } from 'senaev-utils/src/utils/mtls/mtlsServer';
import { createSecureContextOptions, type TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';

import { logger } from '../logger';

const BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * Plain HTTP, for the routes that serve only the already-published `<vault>/public` folder and
 * the metrics. It must never get a route that reads or edits anything else: see runVaultServer.
 */
export function createVaultServer() {
    return Fastify({
        loggerInstance: logger as FastifyBaseLogger,
        bodyLimit: BODY_LIMIT_BYTES,
    });
}

/**
 * Derived from the factory. Our pino instance is passed as `FastifyBaseLogger`: with its own
 * type, the instance's logger type would change and the plain `FastifyInstance` would no
 * longer match it.
 */
export type VaultServer = ReturnType<typeof createVaultServer>;

/** What the route registrars use of a server: a registrar cannot start or stop it. */
export type VaultRouter = Pick<VaultServer, 'get' | 'post' | 'addHook' | 'register'>;

/**
 * HTTPS that accepts only clients with a certificate of the internal CA. A Fastify instance has
 * one listener, and its HTTPS options are fixed when it is created, so the protected routes
 * need an instance of their own.
 */
export function createProtectedVaultServer(credentials: TlsCredentials, serverLogger: FastifyBaseLogger) {
    const server = Fastify({
        loggerInstance: serverLogger,
        bodyLimit: BODY_LIMIT_BYTES,
        https: createMtlsServerOptions(credentials),
    });

    return {
        server,
        /** New connections use the renewed certificate; open ones keep the old one. */
        updateCredentials: (renewed: TlsCredentials) => {
            server.server.setSecureContext(createSecureContextOptions(renewed));
        },
    };
}
