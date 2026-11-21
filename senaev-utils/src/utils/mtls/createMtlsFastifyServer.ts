import type { Server as HttpsServer } from 'node:https';

import type FastifyFactory from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { createMtlsServerOptions } from './mtlsServer';
import { registerMtlsAuthentication } from './registerMtlsAuthentication';
import { createSecureContextOptions } from './tlsCredentials';
import { watchTlsCredentials } from './watchTlsCredentials';

/**
 * HTTPS that accepts only clients with a certificate of the internal CA, and checks on every
 * request that the certificate is still valid (`registerMtlsAuthentication`). A Fastify instance
 * has one listener, and its HTTPS options are fixed when it is created, so the protected routes
 * need an instance of their own.
 *
 * It loads the certificate files of the mounted Secret (`watchTlsCredentials`), and new
 * connections use each renewal; open ones keep the old certificate. Closing the server stops the
 * polling. It rejects when the first files cannot be read.
 *
 * The caller passes `Fastify`: the library imports only its types, so a production install of
 * senaev-utils does not need Fastify, and the service and the library use one copy.
 */
export async function createMtlsFastifyServer({ Fastify, logger }: {
    Fastify: typeof FastifyFactory;
    logger: FastifyBaseLogger;
}): Promise<FastifyInstance<HttpsServer>> {
    const certificates = await watchTlsCredentials({
        onChange: (credentials) => {
            server.server.setSecureContext(createSecureContextOptions(credentials));
            logger.info({ validTo: credentials.validTo.toISOString() }, '🔐 Loaded the renewed mTLS certificate');
        },
        onError: (error) => logger.error({ err: error }, '❌ mTLS certificate files cannot be used, keeping the last valid ones'),
    });
    const server = Fastify({
        loggerInstance: logger,
        https: createMtlsServerOptions(certificates.credentials),
    });

    registerMtlsAuthentication(server);
    server.addHook('onClose', (_instance, done) => {
        certificates.stop();
        done();
    });

    return server;
}
