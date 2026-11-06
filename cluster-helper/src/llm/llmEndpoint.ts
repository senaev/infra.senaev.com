import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import type { LlmEndpointModel } from './llmEndpointModels';
import { type RequestUpstream, requestUpstream as defaultRequestUpstream } from './requestUpstream';

export const LLM_ENDPOINT_PREFIX = '/llm';

// No real limit for now; an 8k-token prompt is far below it. Only an authenticated client
// gets this far, because the API key is checked before the body is read.
const BODY_LIMIT_BYTES = 100 * 1024 * 1024;

export type LlmEndpointOptions = {
    apiKey: string;
    models: readonly LlmEndpointModel[];
    requestUpstream?: RequestUpstream;
};

function sha256(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

function sendError(reply: FastifyReply, status: number, code: string, message: string) {
    return reply.code(status).send({
        error: {
            message,
            type: status >= 500 ? 'server_error' : 'invalid_request_error',
            code,
        },
    });
}

/**
 * The OpenAI-compatible API of the models that run in the cluster: `GET /models` and
 * `POST /chat/completions`, behind one API key. The request body goes to the upstream as
 * it is, and the answer streams back, so `stream: true` works.
 */
export const llmEndpoint: FastifyPluginCallback<LlmEndpointOptions> = (instance, {
    apiKey,
    models,
    requestUpstream = defaultRequestUpstream,
}, done) => {
    const apiKeyHash = sha256(apiKey);

    instance.addHook('onRequest', (request, reply, hookDone) => {
        const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];

        if (token === undefined || !timingSafeEqual(sha256(token), apiKeyHash)) {
            sendError(reply, 401, 'invalid_api_key', 'Invalid API key');

            return;
        }

        hookDone();
    });

    instance.get('/models', () => {
        return {
            object: 'list',
            data: models.map(({ id, ownedBy }) => {
                return {
                    id,
                    object: 'model',
                    created: 0,
                    owned_by: ownedBy,
                };
            }),
        };
    });

    instance.post('/chat/completions', { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
        const { body } = request;
        const modelId = isObject(body) ? body.model : undefined;

        if (typeof modelId !== 'string') {
            return sendError(reply, 400, 'invalid_request', 'The body must be a JSON object with a "model" string');
        }

        const model = models.find(({ id }) => id === modelId);

        if (model === undefined) {
            return sendError(reply, 404, 'model_not_found', `The model "${modelId}" does not exist`);
        }

        const exchange = {
            model: model.id,
            stream: isObject(body) && body.stream === true,
        };
        const abortController = new AbortController();

        // `close` also comes after a normal end, when aborting changes nothing.
        reply.raw.on('close', () => abortController.abort());

        try {
            const response = await requestUpstream({
                url: model.chatCompletionsUrl,
                body: JSON.stringify(body),
                signal: abortController.signal,
            });

            request.log.info({
                ...exchange,
                status: response.status,
            }, '🧠 LLM endpoint request');

            return reply
                .code(response.status)
                .header('content-type', response.contentType ?? 'application/json')
                .send(response.body);
        } catch (error) {
            request.log.error({
                ...exchange,
                error: error instanceof Error ? error.message : String(error),
            }, '❌ LLM endpoint upstream is unreachable');

            return sendError(reply, 502, 'upstream_unavailable', `The model "${model.id}" is unavailable`);
        }
    });

    done();
};
