import Fastify from 'fastify';
import type { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import { registerMtlsCallerAllowlist } from 'senaev-utils/src/utils/mtls/registerMtlsCallerAllowlist';
import type { TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';

import { ALLOWED_CALLERS } from './callers';
import { logger } from './logger';
import { registerSendTelegramMessageRoute } from './registerSendTelegramMessageRoute';

/**
 * The routes for the services with a certificate of the internal CA. Only the services in
 * `ALLOWED_CALLERS` may call any of them.
 */
export function createMtlsServer(credentials: Signal<TlsCredentials>) {
    const server = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials,
    });

    // First, so the check covers every route registered below. The caller is already
    // authenticated by `createMtlsFastifyServer`.
    registerMtlsCallerAllowlist(server, ALLOWED_CALLERS);
    registerSendTelegramMessageRoute(server);

    return server;
}
