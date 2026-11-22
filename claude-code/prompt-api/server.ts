import Fastify from 'fastify';

import { logger } from './logger';
import { PromptRunner } from './runPrompt';

const MAX_PROMPT_LENGTH = 100_000;

/**
 * `POST /run` with `{ "prompt": "..." }` runs the prompt and answers with the result when the
 * run ends. One run at a time: another request during a run gets 409.
 * Only n8n reaches this port (NetworkPolicy), so there is no token.
 */
export function createPromptApiServer(runPrompt: PromptRunner) {
    const server = Fastify({ loggerInstance: logger });
    let running = false;

    server.get('/health', (_request, reply) => reply.send({ status: 'ok' }));

    server.post<{ Body: unknown }>('/run', async (request, reply) => {
        const body = request.body as { prompt?: unknown } | null;
        const prompt = body?.prompt;

        if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > MAX_PROMPT_LENGTH) {
            return reply.code(400).send({
                status: 'error',
                message: `The body must be { "prompt": "<text up to ${MAX_PROMPT_LENGTH} characters>" }`,
            });
        }

        if (running) {
            return reply.code(409).send({
                status: 'error',
                message: 'Another prompt is running',
            });
        }

        running = true;
        logger.info({ promptLength: prompt.length }, '🆕 Running a prompt');

        try {
            const result = await runPrompt(prompt);

            logger.info({
                isError: result.isError,
                durationMs: result.durationMs,
                numTurns: result.numTurns,
                costUsd: result.costUsd,
                resultLength: result.result.length,
            }, result.isError ? '⚠️ The prompt ended with an error' : '✅ The prompt finished');

            return reply.code(result.isError ? 502 : 200).send({
                status: result.isError ? 'error' : 'ok',
                ...result,
            });
        } catch (error) {
            logger.error(error, '❌ Could not run the prompt');

            return reply.code(502).send({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        } finally {
            running = false;
        }
    });

    return server;
}
