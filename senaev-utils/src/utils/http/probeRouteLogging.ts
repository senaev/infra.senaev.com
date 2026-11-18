import type { IncomingMessage } from 'node:http';

import type { FastifyBaseLogger } from 'fastify';

/**
 * Message prefix of every log line of a probe route: health probes, metric scrapes and heartbeats that
 * call a service every few seconds. The lines also get the field `probe: true`, so both
 * `"[probe]"` and `@probe:true` find them in Datadog.
 */
export const PROBE_ROUTE_LOG_PREFIX = '[probe] ';

type ChildLoggerFactory = (
    logger: FastifyBaseLogger,
    bindings: Record<string, unknown>,
    childOptions: Parameters<FastifyBaseLogger['child']>[1],
    rawRequest: IncomingMessage,
) => FastifyBaseLogger;

/**
 * A Fastify `childLoggerFactory` that marks the request logger of the given paths (query
 * ignored), so Fastify's own `incoming request` and `request completed` lines, and whatever
 * the route logs through `request.log`, start with {@link PROBE_ROUTE_LOG_PREFIX}.
 */
export function createProbeRouteChildLoggerFactory(probePaths: readonly string[]): ChildLoggerFactory {
    const paths = new Set(probePaths);

    return (logger, bindings, childOptions, rawRequest) => {
        const path = rawRequest.url?.split('?')[0];

        if (path === undefined || !paths.has(path)) {
            return logger.child(bindings, childOptions);
        }

        return logger.child({
            ...bindings,
            probe: true,
        }, {
            ...childOptions,
            msgPrefix: PROBE_ROUTE_LOG_PREFIX,
        });
    };
}
