import type { Server as HttpsServer } from 'node:https';

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { createMtlsServerOptions } from 'senaev-utils/src/utils/mtls/mtlsServer';
import { createSecureContextOptions, type TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';

import { logger } from '../logger';

import { registerMtlsAuthentication } from './registerMtlsAuthentication';

const BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * Plain HTTP, for the routes that serve only the already-published `<vault>/public` folder and
 * the metrics. It must never get a route that reads or edits anything else: see runVaultServer.
 */
export function createVaultServer() {
    return Fastify({
        // Typed as `FastifyBaseLogger`: with pino's own type, the instance's logger type would
        // change and the plain `FastifyInstance` would no longer match it.
        loggerInstance: logger as FastifyBaseLogger,
        bodyLimit: BODY_LIMIT_BYTES,
    });
}

/**
 * HTTPS that accepts only clients with a certificate of the internal CA, and checks on every
 * request that the certificate is still valid (`registerMtlsAuthentication`). A Fastify instance
 * has one listener, and its HTTPS options are fixed when it is created, so the protected routes
 * need an instance of their own.
 */
export function createProtectedVaultServer(
    credentials: TlsCredentials,
    serverLogger: FastifyBaseLogger
): {
        server: FastifyInstance<HttpsServer>;
        /** New connections use the renewed certificate; open ones keep the old one. */
        updateCredentials: (renewed: TlsCredentials) => void;
    } {
    const server = Fastify({
        loggerInstance: serverLogger,
        bodyLimit: BODY_LIMIT_BYTES,
        https: createMtlsServerOptions(credentials),
    });

    registerMtlsAuthentication(server);

    return {
        server,
        updateCredentials: (renewed) => {
            server.server.setSecureContext(createSecureContextOptions(renewed));
        },
    };
}
