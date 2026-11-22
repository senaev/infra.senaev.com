import {
    describe, expect, it,
} from 'vitest';

import { PromptResult } from './runPrompt';
import { createPromptApiServer } from './server';

const RESULT: PromptResult = {
    result: '☀️ Sunny, 12–21 °C',
    isError: false,
    durationMs: 1000,
    numTurns: 2,
    costUsd: 0.01,
};

describe('createPromptApiServer', () => {
    it('answers the health check', async () => {
        const server = createPromptApiServer(() => Promise.resolve(RESULT));
        const response = await server.inject({ url: '/health' });

        expect(response.statusCode).toBe(200);
    });

    it('runs the prompt and returns its result', async () => {
        const prompts: string[] = [];
        const server = createPromptApiServer((prompt) => {
            prompts.push(prompt);

            return Promise.resolve(RESULT);
        });
        const response = await server.inject({
            method: 'POST',
            url: '/run',
            payload: { prompt: 'Weather in Madrid?' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            status: 'ok',
            ...RESULT,
        });
        expect(prompts).toEqual(['Weather in Madrid?']);
    });

    it('rejects a request without a prompt', async () => {
        const server = createPromptApiServer(() => Promise.resolve(RESULT));
        const response = await server.inject({
            method: 'POST',
            url: '/run',
            payload: { text: 'x' },
        });

        expect(response.statusCode).toBe(400);
    });

    it('runs one prompt at a time', async () => {
        let finish: (result: PromptResult) => void = () => {};
        const server = createPromptApiServer(() => new Promise((resolve) => {
            finish = resolve;
        }));
        const first = server.inject({
            method: 'POST',
            url: '/run',
            payload: { prompt: 'first' },
        });

        // Wait until the first request is inside the handler.
        await new Promise((resolve) => setImmediate(resolve));
        const second = await server.inject({
            method: 'POST',
            url: '/run',
            payload: { prompt: 'second' },
        });

        expect(second.statusCode).toBe(409);
        finish(RESULT);
        expect((await first).statusCode).toBe(200);
    });

    it('answers 502 when the run fails or ends with an error', async () => {
        const failing = createPromptApiServer(() => Promise.reject(new Error('claude -p printed no result: not logged in')));
        const failed = await failing.inject({
            method: 'POST',
            url: '/run',
            payload: { prompt: 'x' },
        });

        expect(failed.statusCode).toBe(502);
        expect(failed.json()).toEqual({
            status: 'error',
            message: 'claude -p printed no result: not logged in',
        });

        const erroring = createPromptApiServer(() => Promise.resolve({
            ...RESULT,
            isError: true,
        }));

        expect((await erroring.inject({
            method: 'POST',
            url: '/run',
            payload: { prompt: 'x' },
        })).statusCode).toBe(502);
    });
});
