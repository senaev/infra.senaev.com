import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import type { LlmProvider } from './llmProviders';
import { requestChatCompletion } from './requestChatCompletion';

const PROVIDER: LlmProvider = {
    name: 'llm-server',
    enabled: true,
    url: 'http://llm-server:8080/v1/chat/completions',
    model: 'default',
    headers: { 'X-Test': 'yes' },
    timeoutMs: 1000,
    maxTokens: 256,
};

function request(provider: LlmProvider = PROVIDER) {
    return requestChatCompletion({
        provider,
        messages: [
            {
                role: 'user',
                content: 'hi',
            },
        ],
        jsonSchema: {
            name: 'answer',
            schema: { type: 'object' },
        },
    });
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('requestChatCompletion', () => {
    it('sends a JSON schema request and returns the message content', async () => {
        const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }))));

        vi.stubGlobal('fetch', fetchMock);

        await expect(request()).resolves.toBe('{"a":1}');

        const [
            url,
            init,
        ] = fetchMock.mock.calls[0] ?? [];

        expect(url).toBe(PROVIDER.url);
        expect(init?.headers).toEqual({
            'Content-Type': 'application/json',
            'X-Test': 'yes',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
            model: 'default',
            temperature: 0,
            max_tokens: 256,
            messages: [
                {
                    role: 'user',
                    content: 'hi',
                },
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    strict: true,
                    name: 'answer',
                    schema: { type: 'object' },
                },
            },
        });
    });

    it('omits max_tokens when the provider has no limit', async () => {
        const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))));

        vi.stubGlobal('fetch', fetchMock);

        await request({
            ...PROVIDER,
            maxTokens: null,
        });

        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).not.toHaveProperty('max_tokens');
    });

    it('throws on an HTTP error', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('loading model', { status: 503 }))));

        await expect(request()).rejects.toThrow('llm-server request failed: 503 loading model');
    });

    it('throws when the response has no message content', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ choices: [] })))));

        await expect(request()).rejects.toThrow('llm-server response did not contain message content');
    });

    it.each([
        {
            label: 'JSON body',
            method: 'json',
            status: 200,
        },
        {
            label: 'error body',
            method: 'text',
            status: 503,
        },
    ])('keeps the provider timeout active while reading the $label', async ({ method, status }) => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;

        vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
            signal = init.signal as AbortSignal;
            const readBody = () => new Promise<never>((_resolve, reject) => {
                signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
            });

            return Promise.resolve({
                ok: status === 200,
                status,
                json: method === 'json' ? readBody : vi.fn(),
                text: method === 'text' ? readBody : vi.fn(),
            } as unknown as Response);
        }));

        const assertion = expect(request()).rejects.toThrow('llm-server request timed out after 1000ms');

        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
        expect(signal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('aborts the request after the provider timeout', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })));

        const result = request();
        const assertion = expect(result).rejects.toThrow('llm-server request timed out after 1000ms');

        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });
});
