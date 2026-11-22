import type { FastifyBaseLogger } from 'fastify';
import { createLogger } from 'senaev-utils/src/utils/createLogger';

// Typed as `FastifyBaseLogger`: with pino's own type, the logger type of a Fastify instance would
// change and the plain `FastifyInstance` would no longer match it.
export const logger: FastifyBaseLogger = createLogger({ name: 'code-tools' });
