import type { FastifyReply, FastifyRequest } from 'fastify';

// The subscription secret is in the path, so the logs never get the URL of a request.

/** Replaces the default Fastify request serializer, which logs `req.url`. */
export function serializeRequest(request: FastifyRequest) {
    return {
        method: request.method,
        route: request.routeOptions.url ?? '(no route)',
        remoteAddress: request.ip,
    };
}

/** Replaces the default Fastify 404 handler, which logs `Route <method>:<url> not found`. */
export function replyNotFound(_request: FastifyRequest, reply: FastifyReply) {
    return reply.code(404).type('text/plain; charset=utf-8').send('Not Found');
}
