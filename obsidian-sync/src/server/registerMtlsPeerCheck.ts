import { checkMtlsPeer } from 'senaev-utils/src/utils/mtls/mtlsServer';

import { logger } from '../logger';

import type { VaultServer } from './createVaultServer';

/**
 * The TLS handshake already proved that the caller has a certificate of the internal CA. This
 * hook also requires that it is the one service allowed to call the protected API, so another
 * service with a valid certificate cannot read or edit the vault. Added before the routes, so it
 * covers all of them, the 404 handler included.
 */
export function registerMtlsPeerCheck(server: VaultServer, allowedClientName: string): void {
    server.addHook('onRequest', (request, reply, done) => {
        const check = checkMtlsPeer(request.raw.socket, allowedClientName, new Date());

        if (check.ok) {
            done();

            return;
        }

        logger.warn({
            method: request.method,
            url: request.url,
            reason: check.reason,
        }, '⚠️ Rejected a request without an authorized client certificate');
        void reply.code(401).send({
            status: 'error',
            code: 'unauthorized',
            message: 'Unauthorized',
        });
    });
}
