import { Readable } from 'node:stream';

import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, Mock, vi,
} from 'vitest';

import { LLM_ENDPOINT_PREFIX, llmEndpoint } from './llmEndpoint';
import { getLlmEndpointModels } from './llmEndpointModels';
import type { RequestUpstream } from './requestUpstream';

const API_KEY = 'test-api-key';
const LLM_SERVER_URL = 'http://llm-server:8080';
const MODEL_ID = 'home/qwen3-4b';

let server: FastifyInstance;
let requestUpstream: Mock<RequestUpstream>;

function upstreamAnswer(status: number, contentType: string, body: string) {
    return {
        status,
        contentType,
        body: Readable.from([body]),
    };
}

function call({
    method = 'POST', path = '/chat/completions', body, apiKey = API_KEY,
}: {
    method?: 'GET' | 'POST';
    path?: string;
    body?: unknown;
    apiKey?: string | null;
} = {}) {
    return server.inject({
        method,
        url: `${LLM_ENDPOINT_PREFIX}${path}`,
        headers: {
            'content-type': 'application/json',
            ...(apiKey !== null && { authorization: `Bearer ${apiKey}` }),
        },
        ...(body !== undefined && { payload: JSON.stringify(body) }),
    });
}

beforeEach(async () => {
    requestUpstream = vi.fn<RequestUpstream>();
    server = Fastify();
    // Same catch-all as the public server: the /llm routes must win over it.
    server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));
    await server.register(llmEndpoint, {
        prefix: LLM_ENDPOINT_PREFIX,
        apiKey: API_KEY,
        models: getLlmEndpointModels(LLM_SERVER_URL),
        requestUpstream,
    });
});

afterEach(async () => {
    await server.close();
});

describe('authentication', () => {
    it('rejects a missing or wrong API key before it reads the body', async () => {
        for (const apiKey of [
            null,
            'wrong-key',
        ]) {
            const response = await call({
                apiKey,
                body: { model: MODEL_ID },
            });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toMatchObject({ error: { code: 'invalid_api_key' } });
        }

        expect(requestUpstream).not.toHaveBeenCalled();
    });

    it('rejects a request without an API key for the model list too', async () => {
        const response = await call({
            method: 'GET',
            path: '/models',
            apiKey: null,
        });

        expect(response.statusCode).toBe(401);
    });
});

describe('GET /models', () => {
    it('lists the models in the OpenAI format', async () => {
        const response = await call({
            method: 'GET',
            path: '/models',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            object: 'list',
            data: [
                {
                    id: MODEL_ID,
                    object: 'model',
                    created: 0,
                    owned_by: 'senaev-media',
                },
            ],
        });
    });

    it('lists no models when llm-server is disabled', () => {
        expect(getLlmEndpointModels(null)).toEqual([]);
    });
});

describe('POST /chat/completions', () => {
    const body = {
        model: MODEL_ID,
        stream: true,
        messages: [
            {
                role: 'user',
                content: 'Привет',
            },
        ],
        tools: [],
    };

    it('sends the body as it is to the model upstream and returns its answer', async () => {
        const events = 'data: {"choices":[{"delta":{"content":"Привет"}}]}\n\ndata: [DONE]\n\n';

        requestUpstream.mockResolvedValue(upstreamAnswer(200, 'text/event-stream', events));

        const response = await call({ body });

        expect(requestUpstream).toHaveBeenCalledWith(expect.objectContaining({ url: `${LLM_SERVER_URL}/v1/chat/completions` }));
        expect(JSON.parse(requestUpstream.mock.calls[0]?.[0].body ?? '')).toEqual(body);
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('text/event-stream');
        expect(response.body).toBe(events);
    });

    it('passes an upstream error status and body to the client', async () => {
        const error = '{"error":{"code":400,"message":"the request exceeds the available context size"}}';

        requestUpstream.mockResolvedValue(upstreamAnswer(400, 'application/json; charset=utf-8', error));

        const response = await call({ body });

        expect(response.statusCode).toBe(400);
        expect(response.body).toBe(error);
    });

    it('answers 502 when the upstream is unreachable', async () => {
        requestUpstream.mockRejectedValue(new Error('connect ECONNREFUSED'));

        const response = await call({ body });

        expect(response.statusCode).toBe(502);
        expect(response.json()).toMatchObject({ error: { code: 'upstream_unavailable' } });
    });

    it('answers 404 for an unknown model and 400 for a body without a model', async () => {
        const unknown = await call({ body: { model: 'gpt-5' } });
        const withoutModel = await call({ body: { messages: [] } });

        expect(unknown.statusCode).toBe(404);
        expect(unknown.json()).toMatchObject({ error: { code: 'model_not_found' } });
        expect(withoutModel.statusCode).toBe(400);
        expect(requestUpstream).not.toHaveBeenCalled();
    });
});
