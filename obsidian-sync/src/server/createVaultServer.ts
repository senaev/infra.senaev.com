import Fastify, { type FastifyBaseLogger } from 'fastify';

import { logger } from '../logger';

/**
 * Plain HTTP, for the routes that serve only the already-published `<vault>/public` folder and
 * the metrics. It must never get a route that reads or edits anything else: see runVaultServer.
 */
export function createVaultServer() {
    return Fastify({
        // Typed as `FastifyBaseLogger`: with pino's own type, the instance's logger type would
        // change and the plain `FastifyInstance` would no longer match it.
        loggerInstance: logger as FastifyBaseLogger,
    });
}
