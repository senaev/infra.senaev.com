import type FastifyFactory from 'fastify';
import type { FastifyBaseLogger } from 'fastify';

/** Create a plain HTTP server with a `/health` endpoint, using the caller's Fastify installation. */
export function createHealthServer({
    Fastify, logger,
}: {
    Fastify: typeof FastifyFactory;
    logger: FastifyBaseLogger;
}) {
    const server = Fastify({ loggerInstance: logger });

    server.get('/health', () => {
        return { status: 'ok' };
    });

    return server;
}
