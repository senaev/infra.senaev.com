import { createLogger } from 'senaev-utils/src/utils/createLogger';

import { serializeRequest } from './requestLogging';

// Fastify uses the serializers of this instance before its own defaults.
export const logger = createLogger({ name: 'vpn-subscription' }).child({}, { serializers: { req: serializeRequest } });
