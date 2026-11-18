import Fastify, { LogController } from 'fastify';
import { createProbeLogController } from 'senaev-utils/src/utils/http/probeRouteLogging';

import { logger } from '../logger';

const BODY_LIMIT_BYTES = 1024 * 1024;

export function createVaultServer() {
    return Fastify({
        loggerInstance: logger,
        bodyLimit: BODY_LIMIT_BYTES,
        // vmagent scrapes it every 30 seconds: its request logs start with `[probe] `.
        logController: createProbeLogController(LogController, ['/metrics']),
    });
}

/**
 * Derived from the factory rather than using Fastify's exported `FastifyInstance`,
 * because passing our own pino instance as `loggerInstance` changes the instance's
 * logger type and the default `FastifyInstance` no longer matches it.
 */
export type VaultServer = ReturnType<typeof createVaultServer>;
