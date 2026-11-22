import Fastify from 'fastify';

import { logger } from '../logger';

/**
 * Plain HTTP for the kubelet, which cannot present a client certificate. It has only `/health`
 * and must never get a tool route.
 */
export function createHealthServer() {
    const server = Fastify({ loggerInstance: logger });

    server.get('/health', () => {
        return { status: 'ok' };
    });

    return server;
}
