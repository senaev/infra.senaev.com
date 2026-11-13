import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callLlmJson } from './callLlmJson';
import type { LlmProvider } from './llmProviders';
import { requestChatCompletion } from './requestChatCompletion';

vi.mock('../logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
        },
    };
});

vi.mock('./requestChatCompletion', () => {
    return { requestChatCompletion: vi.fn() };
});

function buildProvider(name: string): LlmProvider {
    return {
        name,
        enabled: true,
        url: `http://${name}/v1/chat/completions`,
        model: 'model',
        headers: {},
        timeoutMs: 1000,
        maxTokens: null,
    };
}

const LOCAL = buildProvider('local');
const REMOTE = buildProvider('remote');

function parseAnswer(value: unknown): string {
    const { answer } = value as { answer?: unknown };

    if (typeof answer !== 'string') {
        throw new Error('answer is not a string');
    }

    return answer;
}

function call() {
    return callLlmJson({
        providers: [
            LOCAL,
            REMOTE,
        ],
        messages: [
            {
                role: 'user',
                content: 'hi',
            },
        ],
        jsonSchema: {
            name: 'answer',
            schema: {},
        },
        parse: parseAnswer,
    });
}

function answerBy(contentByProvider: Record<string, string | Error>): void {
    vi.mocked(requestChatCompletion).mockImplementation(({ provider }) => {
        const content = contentByProvider[provider.name];

        return content instanceof Error || content === undefined
            ? Promise.reject(content ?? new Error('no answer'))
            : Promise.resolve(content);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('callLlmJson', () => {
    it('returns the answer of the first provider and does not call the next one', async () => {
        answerBy({ local: '{"answer":"from local"}' });

        const result = await call();

        expect(result.value).toBe('from local');
        expect(result.provider).toBe('local');
        expect(result.attempts).toEqual([
            expect.objectContaining({
                provider: 'local',
                error: null,
            }),
        ]);
        expect(requestChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('falls back to the next provider when a request fails', async () => {
        answerBy({
            local: new Error('local request timed out after 1000ms'),
            remote: '{"answer":"from remote"}',
        });

        const result = await call();

        expect(result.value).toBe('from remote');
        expect(result.provider).toBe('remote');
        expect(result.attempts.map(({ provider, error }) => [
            provider,
            error,
        ])).toEqual([
            [
                'local',
                expect.stringContaining('timed out'),
            ],
            [
                'remote',
                null,
            ],
        ]);
    });

    it('falls back when the answer is not JSON', async () => {
        answerBy({
            local: 'ис ис ис',
            remote: '{"answer":"from remote"}',
        });

        expect((await call()).provider).toBe('remote');
    });

    it('falls back when parse rejects the answer', async () => {
        answerBy({
            local: '{"answer":42}',
            remote: '{"answer":"from remote"}',
        });

        const result = await call();

        expect(result.provider).toBe('remote');
        expect(result.attempts[0]?.error).toContain('answer is not a string');
    });

    it('returns no value and every attempt when all providers fail', async () => {
        answerBy({});

        const result = await call();

        expect(result.value).toBeNull();
        expect(result.provider).toBeNull();
        expect(result.attempts.map(({ provider }) => provider)).toEqual([
            'local',
            'remote',
        ]);
    });
});
