import Fastify from 'fastify';
import { isValidBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';

import { logger } from '../logger';

const BODY_LIMIT_BYTES = 1024 * 1024;
const HEALTH_PATH = '/health';

export function createCodeToolsServer(internalToken: string) {
    const server = Fastify({
        loggerInstance: logger,
        bodyLimit: BODY_LIMIT_BYTES,
    });

    // Every route except the Kubernetes liveness probe needs the token that only
    // cluster-helper has, because the tools give a full shell in the container.
    server.addHook('onRequest', (request, reply, done) => {
        if (request.url === HEALTH_PATH || isValidBearerAuthorizationHeader(request.headers.authorization, internalToken)) {
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

    server.get(HEALTH_PATH, () => {
        return { status: 'ok' };
    });

    return server;
}

export type CodeToolsServer = ReturnType<typeof createCodeToolsServer>;
