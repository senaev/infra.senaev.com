import type FastifyFactory from 'fastify';
import type { FastifyBaseLogger } from 'fastify';

/** Create a plain HTTP server with a liveness endpoint, using the caller's Fastify installation. */
export function createHealthServer({
    Fastify, logger, path = '/health',
}: {
    Fastify: typeof FastifyFactory;
    logger: FastifyBaseLogger;
    path?: string;
}) {
    const server = Fastify({ loggerInstance: logger });

    server.get(path, () => {
        return { status: 'ok' };
    });

    return server;
}
