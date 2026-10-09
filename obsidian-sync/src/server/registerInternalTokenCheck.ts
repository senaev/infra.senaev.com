import { isValidBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';

import { logger } from '../logger';

import type { VaultServer } from './createVaultServer';

declare module 'fastify' {
    interface FastifyContextConfig {
        /**
         * Lets a route answer without the internal token. Only the `?note=`/`?file=` routes
         * use it: nextjs-app calls them without credentials, and they serve only the
         * already-published `<vault>/public` folder.
         */
        isPublicWithoutInternalToken?: boolean;
    }
}

/**
 * Every other route needs the token that only cluster-helper has, so no other pod in the
 * cluster can read or edit the vault. Added before the routes, so it covers all of them,
 * the 404 handler included.
 */
export function registerInternalTokenCheck(server: VaultServer, internalToken: string): void {
    server.addHook('onRequest', (request, reply, done) => {
        if (request.routeOptions.config.isPublicWithoutInternalToken === true || isValidBearerAuthorizationHeader(request.headers.authorization, internalToken)) {
            done();

            return;
        }

        logger.warn({
            method: request.method,
            url: request.url,
        }, '⚠️ Rejected a request without a valid internal token');
        void reply.code(401).send({
            status: 'error',
            code: 'unauthorized',
            message: 'Unauthorized',
        });
    });
}
