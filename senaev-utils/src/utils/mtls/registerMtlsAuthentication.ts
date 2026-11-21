import type {
    FastifyInstance, FastifyRequest, RawServerBase,
} from 'fastify';

import { authenticateMtlsCaller, type MtlsCaller } from './mtlsServer';

/** A request on a server with `registerMtlsAuthentication`. Cast to it to set or read the caller. */
export type FastifyRequestWithMtls = FastifyRequest & {
    /** The caller of the request, set by `registerMtlsAuthentication`. */
    mtlsCaller?: MtlsCaller;
};

/**
 * The TLS handshake already proved that the caller has a certificate of the internal CA. This
 * hook requires that the certificate is still valid (401) and keeps the caller on the request
 * for the authorization of the service. Added before the routes, so it covers all of them, the
 * 404 handler included.
 */
export function registerMtlsAuthentication<RawServer extends RawServerBase>(server: Pick<FastifyInstance<RawServer>, 'addHook' | 'decorateRequest'>): void {
    server.decorateRequest('mtlsCaller', undefined);
    server.addHook('onRequest', (request, reply, done) => {
        const authentication = authenticateMtlsCaller(request.raw.socket, new Date());

        if (!authentication.ok) {
            request.log.warn({
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

        (request as FastifyRequestWithMtls).mtlsCaller = authentication.caller;
        done();
    });
}
