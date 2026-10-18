import { Readable } from 'node:stream';

import type {
    FastifyPluginCallback, FastifyReply, FastifyRequest,
} from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import type { AccessTokenCheck } from '../oauth/authorizationServer';
import { sendBearerChallenge } from '../oauth/sendBearerChallenge';

// A dashboard JSON in a tool call can be large.
const BODY_LIMIT_BYTES = 10 * 1024 * 1024;

const FORWARDED_REQUEST_HEADERS = [
    'content-type',
    'accept',
    'mcp-session-id',
    'mcp-protocol-version',
    'last-event-id',
] as const;

const FORWARDED_RESPONSE_HEADERS = [
    'content-type',
    'mcp-session-id',
    'cache-control',
] as const;

const JSON_RPC_INTERNAL_ERROR = -32603;
const JSON_RPC_METHOD_NOT_FOUND = -32601;

// ChatGPT sends this first, with a protocol version newer than mcp-grafana 2.0.2 handles, and
// mcp-grafana answers 400. ChatGPT retries `initialize` only after a JSON-RPC "method not found".
const SERVER_DISCOVER_METHOD = 'server/discover';

export type GrafanaMcpProxyOptions = {
    path: string;
    mcpDomain: string;
    resourceMetadataUrl: string;
    checkAccessToken: (authorizationHeader: string | undefined) => Promise<AccessTokenCheck>;
    upstreamUrl: string;
    upstreamToken: string;
    fetch?: typeof fetch;
};

function parseJsonRpcMessage(body: unknown): Record<string, unknown> | undefined {
    if (!Buffer.isBuffer(body)) {
        return undefined;
    }

    try {
        const message: unknown = JSON.parse(body.toString('utf8'));

        return isObject(message) ? message : undefined;
    } catch {
        return undefined;
    }
}

function describeJsonRpcMessage(message: Record<string, unknown> | undefined) {
    if (message === undefined) {
        return {};
    }

    return {
        method: message.method,
        tool: isObject(message.params) ? message.params.name : undefined,
    };
}

function sendMethodNotFound(reply: FastifyReply, message: Record<string, unknown>) {
    return reply.code(200).send({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: {
            code: JSON_RPC_METHOD_NOT_FOUND,
            message: `Method not found: ${String(message.method)}`,
        },
    });
}

function forwardedRequestHeaders(request: FastifyRequest, upstreamToken: string): Record<string, string> {
    // The OAuth token, `origin`, `cookie` and `host` stay here: mcp-grafana checks the
    // internal token, and its DNS-rebinding check expects its own host and no origin.
    const headers: Record<string, string> = { authorization: `Bearer ${upstreamToken}` };

    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers[name];

        if (typeof value === 'string') {
            headers[name] = value;
        }
    }

    return headers;
}

function sendBadGateway(reply: FastifyReply) {
    return reply.code(502).send({
        jsonrpc: '2.0',
        id: null,
        error: {
            code: JSON_RPC_INTERNAL_ERROR,
            message: 'Grafana MCP server is unavailable',
        },
    });
}

/**
 * The OAuth-protected MCP endpoint for Grafana. It checks the access token, then streams
 * the request to mcp-grafana with the internal token instead, and streams the answer back
 * (mcp-grafana can answer with SSE).
 */
// A plugin, so that the raw body parser applies only to this route.
export const grafanaMcpProxy: FastifyPluginCallback<GrafanaMcpProxyOptions> = (instance, {
    path,
    mcpDomain,
    resourceMetadataUrl,
    checkAccessToken,
    upstreamUrl,
    upstreamToken,
    fetch: fetchUpstream = fetch,
}, done) => {
    instance.removeAllContentTypeParsers();
    instance.addContentTypeParser('*', {
        parseAs: 'buffer',
        bodyLimit: BODY_LIMIT_BYTES,
    }, (_request, body, parsed) => {
        parsed(null, body);
    });

    instance.route({
        method: [
            'GET',
            'POST',
            'DELETE',
        ],
        url: path,
        constraints: { host: mcpDomain },
        handler: async (request, reply) => {
            const check = await checkAccessToken(request.headers.authorization);

            if (check.kind !== 'valid') {
                return sendBearerChallenge(reply, {
                    check,
                    resourceMetadataUrl,
                });
            }

            const message = parseJsonRpcMessage(request.body);
            const exchange = {
                httpMethod: request.method,
                protocolVersion: request.headers['mcp-protocol-version'],
                ...describeJsonRpcMessage(message),
            };

            if (message?.method === SERVER_DISCOVER_METHOD) {
                request.log.info({
                    ...exchange,
                    status: 200,
                }, '📈 Grafana MCP message');

                return sendMethodNotFound(reply, message);
            }

            const abortController = new AbortController();

            // `close` also comes after a normal end, when aborting changes nothing.
            reply.raw.on('close', () => abortController.abort());

            let response: Response;

            try {
                response = await fetchUpstream(upstreamUrl, {
                    method: request.method,
                    headers: forwardedRequestHeaders(request, upstreamToken),
                    ...(Buffer.isBuffer(request.body) && { body: new Uint8Array(request.body) }),
                    signal: abortController.signal,
                });
            } catch (error) {
                request.log.error({
                    ...exchange,
                    error: error instanceof Error ? error.message : String(error),
                }, '❌ Grafana MCP server is unreachable');

                return sendBadGateway(reply);
            }

            // A rejected internal token is our configuration error. Passed through, it
            // would tell ChatGPT that its own token is bad and start a new sign-in.
            if (response.status === 401 || response.status === 403) {
                request.log.error({
                    ...exchange,
                    status: response.status,
                }, '❌ Grafana MCP server rejected the internal token');

                return sendBadGateway(reply);
            }

            request.log.info({
                ...exchange,
                status: response.status,
            }, '📈 Grafana MCP message');

            const headers: Record<string, string> = {};

            for (const name of FORWARDED_RESPONSE_HEADERS) {
                const value = response.headers.get(name);

                if (value !== null) {
                    headers[name] = value;
                }
            }

            return reply
                .code(response.status)
                .headers(headers)
                .send(response.body === null ? '' : Readable.from(response.body));
        },
    });

    done();
};
