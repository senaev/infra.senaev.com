import type { FastifyInstance, RawServerBase } from 'fastify';

import type { FastifyRequestWithMtls } from './registerMtlsAuthentication';

/**
 * Requires that the caller is one of the allowed services (403), by the DNS name in its client
 * certificate. Everything else is refused, so a forgotten route is never open to every service
 * of the CA. The caller comes from `registerMtlsAuthentication`, which must be registered
 * first: without a caller on the request, everything is refused (401). Added before the routes,
 * so it covers all of them, the 404 handler included.
 */
export function registerMtlsCallerAllowlist<RawServer extends RawServerBase>(
    server: Pick<FastifyInstance<RawServer>, 'addHook'>,
    allowedCallers: readonly string[]
): void {
    server.addHook('onRequest', (request, reply, done) => {
        const { mtlsCaller } = request as FastifyRequestWithMtls;

        if (mtlsCaller === undefined) {
            request.log.error({
                method: request.method,
                url: request.url,
            }, '❌ A request reached the authorization without an authenticated caller');
            void reply.code(401).send({
                status: 'error',
                code: 'unauthorized',
                message: 'Unauthorized',
            });

            return;
        }

        if (!allowedCallers.some((name) => mtlsCaller.hasDnsName(name))) {
            request.log.warn({
                method: request.method,
                url: request.url,
            }, '⚠️ Rejected a request from a service that is not allowed');
            void reply.code(403).send({
                status: 'error',
                code: 'forbidden',
                message: 'This service is not allowed to call this API',
            });

            return;
        }

        done();
    });
}
