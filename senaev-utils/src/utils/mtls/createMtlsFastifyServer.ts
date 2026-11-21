import type { Server as HttpsServer } from 'node:https';

import type Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { createMtlsServerOptions } from './mtlsServer';
import { registerMtlsAuthentication } from './registerMtlsAuthentication';
import { createSecureContextOptions, type TlsCredentials } from './tlsCredentials';

/**
 * HTTPS that accepts only clients with a certificate of the internal CA, and checks on every
 * request that the certificate is still valid (`registerMtlsAuthentication`). A Fastify instance
 * has one listener, and its HTTPS options are fixed when it is created, so the protected routes
 * need an instance of their own.
 *
 * The caller passes `fastify`: the library imports only its types, so a production install of
 * senaev-utils does not need Fastify, and the service and the library use one copy.
 */
export function createMtlsFastifyServer({
    fastify, credentials, logger,
}: {
    fastify: typeof Fastify;
    credentials: TlsCredentials;
    logger: FastifyBaseLogger;
}): {
        server: FastifyInstance<HttpsServer>;
        /** New connections use the renewed certificate; open ones keep the old one. */
        updateCredentials: (renewed: TlsCredentials) => void;
    } {
    const server = fastify({
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
