import {
    type FastifyError, type FastifyReply, type FastifyRequest, LogController,
} from 'fastify';

// The subscription secret is in the path, so Fastify must not log requests: its request
// logs (incoming, completed, not found, errored) all contain the URL.
export const logController = new LogController({ disableRequestLogging: true });

/** Logs only the error of a failed request, because the request logs are off. */
export function logServerError(error: FastifyError, _request: FastifyRequest, reply: FastifyReply) {
    if ((error.statusCode ?? 500) >= 500) {
        reply.log.error({ err: error }, '❌ Request failed');
    }

    // The default error handler builds the response.
    return reply.send(error);
}
