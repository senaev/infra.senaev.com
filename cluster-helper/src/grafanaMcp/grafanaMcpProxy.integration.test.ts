import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import type { AccessTokenCheck } from '../oauth/authorizationServer';

import { grafanaMcpProxy } from './grafanaMcpProxy';

const MCP_DOMAIN = 'mcp.example.com';
const RESOURCE_METADATA_URL = `https://${MCP_DOMAIN}/.well-known/oauth-protected-resource/grafana`;
const VALID_OAUTH_TOKEN = 'grafana-oauth-token';
const CHAT_GPT_OAUTH_TOKEN = 'chat-gpt-oauth-token';
const INTERNAL_TOKEN = 'internal-token';

type ReceivedRequest = {
    method: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
};

let upstream: FastifyInstance;
let upstreamUrl: string;
let receivedRequests: ReceivedRequest[];
let server: FastifyInstance;

function checkAccessToken(authorizationHeader: string | undefined): Promise<AccessTokenCheck> {
    if (authorizationHeader === undefined) {
        return Promise.resolve({ kind: 'missing' });
    }

    return Promise.resolve(authorizationHeader === `Bearer ${VALID_OAUTH_TOKEN}`
        ? {
            kind: 'valid',
            subject: 'andrei',
        }
        : { kind: 'invalid' });
}

async function startProxy(upstreamToken = INTERNAL_TOKEN) {
    server = Fastify();
    // Same catch-all as the public server: routes bound to another host must fall through to it.
    server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));
    await server.register(grafanaMcpProxy, {
        path: '/grafana',
        mcpDomain: MCP_DOMAIN,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
        checkAccessToken,
        upstreamUrl,
        upstreamToken,
    });
}

function callProxy({
    method = 'POST', body, token, headers,
}: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: string;
    token?: string;
    headers?: Record<string, string>;
} = {}) {
    return server.inject({
        method,
        url: '/grafana',
        ...(body !== undefined && { body }),
        headers: {
            host: MCP_DOMAIN,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...(token !== undefined && { authorization: `Bearer ${token}` }),
            ...headers,
        },
    });
}

beforeEach(async () => {
    receivedRequests = [];
    upstream = Fastify();
    upstream.removeAllContentTypeParsers();
    upstream.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => done(null, body));

    upstream.route({
        method: [
            'GET',
            'POST',
            'DELETE',
        ],
        url: '/mcp',
        handler: (request, reply) => {
            receivedRequests.push({
                method: request.method,
                headers: request.headers,
                body: typeof request.body === 'string' ? request.body : '',
            });

            if (request.headers.authorization !== `Bearer ${INTERNAL_TOKEN}`) {
                return reply.code(401).send('Unauthorized');
            }

            if (request.method === 'GET') {
                reply.raw.writeHead(200, {
                    'content-type': 'text/event-stream',
                    'cache-control': 'no-cache',
                });
                reply.raw.write('event: message\ndata: {"first":true}\n\n');
                reply.raw.end('event: message\ndata: {"second":true}\n\n');

                return reply;
            }

            return reply
                .code(200)
                .header('mcp-session-id', 'session-from-upstream')
                .header('x-upstream-only', 'secret')
                .type('application/json')
                .send({ echoed: request.body });
        },
    });
    await upstream.listen({
        port: 0,
        host: '127.0.0.1',
    });
    upstreamUrl = `http://127.0.0.1:${upstream.addresses()[0]?.port}/mcp`;

    await startProxy();
});

afterEach(async () => {
    await server.close();
    await upstream.close();
});

describe('grafanaMcpProxy', () => {
    it('answers 401 with the Grafana resource metadata without a token', async () => {
        const response = await callProxy({ body: '{}' });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe(`Bearer resource_metadata="${RESOURCE_METADATA_URL}", scope="mcp"`);
        expect(receivedRequests).toEqual([]);
    });

    it('answers 401 with invalid_token for a token of another resource', async () => {
        const response = await callProxy({
            body: '{}',
            token: CHAT_GPT_OAUTH_TOKEN,
        });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
        expect(receivedRequests).toEqual([]);
    });

    it('sends the body unchanged with the internal token instead of the OAuth token', async () => {
        const body = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_dashboards"}}';
        const response = await callProxy({
            body,
            token: VALID_OAUTH_TOKEN,
            headers: {
                origin: 'https://chatgpt.com',
                cookie: 'a=b',
                'mcp-session-id': 'session-from-client',
                'mcp-protocol-version': '2025-06-18',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ echoed: body });

        const [received] = receivedRequests;

        expect(received?.body).toBe(body);
        expect(received?.headers).toMatchObject({
            authorization: `Bearer ${INTERNAL_TOKEN}`,
            'mcp-session-id': 'session-from-client',
            'mcp-protocol-version': '2025-06-18',
            accept: 'application/json, text/event-stream',
        });
        expect(received?.headers).not.toHaveProperty('origin');
        expect(received?.headers).not.toHaveProperty('cookie');
        expect(received?.headers.host).not.toBe(MCP_DOMAIN);
    });

    it('answers server/discover with method not found itself, so the client falls back to initialize', async () => {
        const response = await callProxy({
            body: '{"jsonrpc":"2.0","id":7,"method":"server/discover","params":{}}',
            token: VALID_OAUTH_TOKEN,
            headers: { 'mcp-protocol-version': '2026-07-28' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            jsonrpc: '2.0',
            id: 7,
            error: {
                code: -32601,
                message: 'Method not found: server/discover',
            },
        });
        expect(receivedRequests).toEqual([]);
    });

    it('returns the session id but not other upstream headers', async () => {
        const response = await callProxy({
            body: '{}',
            token: VALID_OAUTH_TOKEN,
        });

        expect(response.headers['mcp-session-id']).toBe('session-from-upstream');
        expect(response.headers).not.toHaveProperty('x-upstream-only');
    });

    it('streams an SSE answer', async () => {
        const response = await callProxy({
            method: 'GET',
            token: VALID_OAUTH_TOKEN,
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('text/event-stream');
        expect(response.body).toBe('event: message\ndata: {"first":true}\n\nevent: message\ndata: {"second":true}\n\n');
    });

    it('passes DELETE through to end the session', async () => {
        const response = await callProxy({
            method: 'DELETE',
            token: VALID_OAUTH_TOKEN,
            headers: { 'mcp-session-id': 'session-from-client' },
        });

        expect(response.statusCode).toBe(200);
        expect(receivedRequests[0]).toMatchObject({ method: 'DELETE' });
    });

    it('answers 502 when the upstream rejects the internal token', async () => {
        await server.close();
        await startProxy('wrong-internal-token');

        const response = await callProxy({
            body: '{}',
            token: VALID_OAUTH_TOKEN,
        });

        expect(response.statusCode).toBe(502);
        expect(response.headers).not.toHaveProperty('www-authenticate');
    });

    it('answers 502 with a JSON-RPC error when the upstream is down', async () => {
        await upstream.close();

        const response = await callProxy({
            body: '{}',
            token: VALID_OAUTH_TOKEN,
        });

        expect(response.statusCode).toBe(502);
        expect(response.json()).toMatchObject({
            jsonrpc: '2.0',
            error: { code: -32603 },
        });
    });

    it('does not answer on another host', async () => {
        const response = await callProxy({
            method: 'GET',
            token: VALID_OAUTH_TOKEN,
            headers: { host: 'other.example.com' },
        });

        expect(response.statusCode).toBe(401);
        expect(receivedRequests).toEqual([]);
    });
});
