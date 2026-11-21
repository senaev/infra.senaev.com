import type { Server as HttpsServer } from 'node:https';

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import { registerMtlsAuthentication } from './registerMtlsAuthentication';
import { createMtlsServerOptions } from './mtlsServer';
import { createSecureContextOptions, type TlsCredentials } from './tlsCredentials';

/**
 * HTTPS that accepts only clients with a certificate of the internal CA, and checks on every
 * request that the certificate is still valid (`registerMtlsAuthentication`). A Fastify instance
 * has one listener, and its HTTPS options are fixed when it is created, so the protected routes
 * need an instance of their own.
 */
export function createMtlsFastifyServer(
    credentials: TlsCredentials,
    logger: FastifyBaseLogger
): {
        server: FastifyInstance<HttpsServer>;
        /** New connections use the renewed certificate; open ones keep the old one. */
        updateCredentials: (renewed: TlsCredentials) => void;
    } {
    const server = Fastify({
        loggerInstance: logger,
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
