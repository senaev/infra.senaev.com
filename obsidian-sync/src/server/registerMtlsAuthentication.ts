import type { FastifyInstance } from 'fastify';
import { authenticateMtlsCaller, type MtlsCaller } from 'senaev-utils/src/utils/mtls/mtlsServer';

import { logger } from '../logger';

declare module 'fastify' {
    interface FastifyRequest {
        /** The caller of the request, set by `registerMtlsAuthentication`. */
        mtlsCaller: MtlsCaller | undefined;
    }
}

/**
 * The TLS handshake already proved that the caller has a certificate of the internal CA. This
 * hook requires that the certificate is still valid (401) and keeps the caller on the request
 * for `registerMtlsAuthorization`. Added before the routes, so it covers all of them, the 404
 * handler included.
 */
export function registerMtlsAuthentication(server: Pick<FastifyInstance, 'addHook' | 'decorateRequest'>): void {
    server.decorateRequest('mtlsCaller', undefined);
    server.addHook('onRequest', (request, reply, done) => {
        const authentication = authenticateMtlsCaller(request.raw.socket, new Date());

        if (!authentication.ok) {
            logger.warn({
                method: request.method,
                url: request.url,
                reason: authentication.reason,
            }, '⚠️ Rejected a request without a valid client certificate');
            void reply.code(401).send({
                status: 'error',
                code: 'unauthorized',
                message: 'Unauthorized',
            });

            return;
        }

        request.mtlsCaller = authentication.caller;
        done();
    });
}
