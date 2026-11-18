import type {
    FastifyReply, FastifyRequest, LogController,
} from 'fastify';

/**
 * Prefix of Fastify's request log lines for probe routes: health probes, metric scrapes and
 * heartbeats that call a service every few seconds. The lines also get the field `probe: true`,
 * so both `"[probe]"` and `@probe:true` find them in Datadog.
 */
export const PROBE_LOG_PREFIX = '[probe] ';

/**
 * A Fastify `LogController` (Fastify documents extending it to customize its log lines) whose
 * `incoming request` and `request completed` lines start with {@link PROBE_LOG_PREFIX} for the
 * given paths (query ignored). Other paths, errors and 5xx answers keep Fastify's default lines:
 * a failing probe is not noise.
 *
 * Pass `LogController` from the service's own `fastify` import: every package has its own copy
 * of Fastify, and Fastify accepts only an instance of its own class.
 *
 * @example Fastify({ logController: createProbeLogController(LogController, ['/health']) })
 */
export function createProbeLogController(
    BaseLogController: typeof LogController,
    probePaths: readonly string[]
): LogController {
    const paths = new Set(probePaths);

    function isProbe(request: FastifyRequest): boolean {
        return paths.has(request.url.split('?')[0] ?? '');
    }

    class ProbeLogController extends BaseLogController {
        public override incomingRequest(request: FastifyRequest, reply: FastifyReply, metadata?: Record<string, unknown>): void {
            if (!isProbe(request)) {
                super.incomingRequest(request, reply, metadata);

                return;
            }

            if (!this.isLogDisabled(request)) {
                request.log.info({
                    req: request,
                    probe: true,
                }, `${PROBE_LOG_PREFIX}incoming request`);
            }
        }

        public override requestCompleted(
            error: Error | null | undefined,
            request: FastifyRequest,
            reply: FastifyReply,
            metadata?: Record<string, unknown>
        ): void {
            if (error || reply.statusCode >= 500 || !isProbe(request)) {
                super.requestCompleted(error, request, reply, metadata);

                return;
            }

            if (!this.isLogDisabled(request)) {
                reply.log.info({
                    res: reply,
                    responseTime: reply.elapsedTime,
                    probe: true,
                }, `${PROBE_LOG_PREFIX}request completed`);
            }
        }
    }

    return new ProbeLogController();
}
