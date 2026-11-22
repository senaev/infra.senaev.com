import type { Server as HttpsServer } from 'node:https';

import type FastifyFactory from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import type { Signal } from '../Signal/Signal';

import { createMtlsServerOptions } from './mtlsServer';
import { registerMtlsAuthentication } from './registerMtlsAuthentication';
import { createSecureContextOptions, type TlsCredentials } from './tlsCredentials';

/**
 * HTTPS that accepts only clients with a certificate of the internal CA, and checks on every
 * request that the certificate is still valid (`registerMtlsAuthentication`). A Fastify instance
 * has one listener, and its HTTPS options are fixed when it is created, so the protected routes
 * need an instance of their own.
 *
 * `credentials` comes from `watchTlsCredentials`, which the caller owns and stops. New
 * connections use each renewal; open ones keep the old certificate. Closing the server
 * unsubscribes it.
 *
 * The caller passes `Fastify`: the library imports only its types, so a production install of
 * senaev-utils does not need Fastify, and the service and the library use one copy.
 */
export function createMtlsFastifyServer({
    Fastify, logger, credentials, bodyLimit,
}: {
    Fastify: typeof FastifyFactory;
    logger: FastifyBaseLogger;
    credentials: Signal<TlsCredentials>;
    /** The largest request body in bytes. The Fastify default (1 MiB) when it is not set. */
    bodyLimit?: number;
}): FastifyInstance<HttpsServer> {
    const server = Fastify({
        loggerInstance: logger,
        https: createMtlsServerOptions(credentials.getValue()),
        ...bodyLimit === undefined ? {} : { bodyLimit },
    });

    registerMtlsAuthentication(server);

    const unsubscribe = credentials.subscribe((renewed) => {
        server.server.setSecureContext(createSecureContextOptions(renewed));
    });

    server.addHook('onClose', (_instance, done) => {
        unsubscribe();
        done();
    });

    return server;
}
