import type { Server as HttpsServer, ServerOptions as HttpsServerOptions } from 'node:https';

import type FastifyFactory from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

type CreateFastifyServerOptions = {
    Fastify: typeof FastifyFactory;
    logger: FastifyBaseLogger;
};

/**
 * A Fastify instance that logs with the given logger, over plain HTTP, or over HTTPS when
 * `https` is set. A service passes its pino logger as `FastifyBaseLogger`: with pino's own type,
 * the logger type of the instance would change and the plain `FastifyInstance` would no longer match it.
 *
 * The caller passes `Fastify`: the library imports only its types, so a production install of
 * senaev-utils does not need Fastify, and the service and the library use one copy.
 */
export function createFastifyServer(options: CreateFastifyServerOptions): FastifyInstance;
export function createFastifyServer(
    options: CreateFastifyServerOptions & { https: HttpsServerOptions }
): FastifyInstance<HttpsServer>;
export function createFastifyServer({
    Fastify, logger, https,
}: CreateFastifyServerOptions & {
    https?: HttpsServerOptions;
}): FastifyInstance | FastifyInstance<HttpsServer> {
    return https === undefined
        ? Fastify({ loggerInstance: logger })
        : Fastify({
            loggerInstance: logger,
            https,
        });
}
