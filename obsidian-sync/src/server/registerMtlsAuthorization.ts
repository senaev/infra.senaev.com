import type { FastifyInstance } from 'fastify';
import { authenticateMtlsPeer } from 'senaev-utils/src/utils/mtls/mtlsServer';

import { logger } from '../logger';

import type { VaultServer } from './createVaultServer';

declare module 'fastify' {
    interface FastifyContextConfig {
        /** The services that may call the route, by the DNS name in their client certificate. */
        callers?: readonly string[];
    }
}

/**
 * The TLS handshake already proved that the caller has a certificate of the internal CA. This
 * hook requires that the certificate is still valid (401), and that the route names a service
 * that the caller is (403). A route that names no service is denied, so a forgotten declaration
 * never opens a route to every service of the CA. Added before the routes, so it covers all of
 * them, the 404 handler included.
 */
export function registerMtlsAuthorization(server: VaultServer): void {
    server.addHook('onRequest', (request, reply, done) => {
        const authentication = authenticateMtlsPeer(request.raw.socket, new Date());

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

        const { callers } = request.routeOptions.config;

        if (callers?.some((name) => authentication.peer.hasName(name)) !== true) {
            logger.warn({
                method: request.method,
                url: request.url,
            }, '⚠️ Rejected a request from a service that may not call this route');
            void reply.code(403).send({
                status: 'error',
                code: 'forbidden',
                message: 'Forbidden',
            });

            return;
        }

        done();
    });
}

/** Registers routes that only the given services may call. */
export function registerRoutesForCallers<T extends Pick<FastifyInstance, 'register'>>(
    server: T,
    callers: readonly string[],
    registerRoutes: (server: T) => void
): void {
    void server.register((scope, _options, done) => {
        scope.addHook('onRoute', (route) => {
            route.config = {
                ...route.config,
                callers,
            };
        });
        registerRoutes(scope as unknown as T);
        done();
    });
}
