import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { callVaultTool, getShortLink } from './obsidianSyncApi';

// env.ts validates the whole environment at import time; vitest runs this before the imports.
vi.hoisted(() => {
    for (const name of [
        'TG_TOKEN_SENAEV_COM_BOT',
        'TG_MEDIA_SERVER_CHAT_ID',
        'TG_CLUSTER_CHAT_ID',
        'WEBHOOK_DOMAIN',
        'ALISA_WEBHOOK_SECRET',
        'AUTH_DOMAIN',
        'MCP_DOMAIN',
        'AUTH_MY_USERNAME',
        'AUTH_MY_PASSWORD',
        'AUTH_TOKEN_SIGNING_SECRET',
        'OPENROUTER_API_KEY',
        'GROQ_API_KEY',
        'SUPABASE_PROJECT_URL',
        'SUPABASE_PUBLISHABLE_KEY',
        'PROWLARR_URL',
        'PROWLARR_CONFIG_FILE',
        'TG_VPN_SUBSCRIPTION_CHAT_ID',
        'OBSIDIAN_TASKS_CHAT_ID',
        'TRICKY_DAD_CHAT_ID',
        'TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID',
    ]) {
        process.env[name] ??= 'test';
    }

    process.env.OBSIDIAN_SYNC_URL = 'http://obsidian-sync:8080';
    process.env.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN = 'internal-token';
});

function mockFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
}

function sentRequest(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
    const [
        url,
        init,
    ] = fetchMock.mock.calls[0] as [string, RequestInit];

    return {
        url,
        init,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('callVaultTool', () => {
    it('posts the arguments unchanged to /vault/<tool> with the internal token', async () => {
        const fetchMock = mockFetch(200, { status: 'ok' });
        const args = { queries: ['gym'] };

        await callVaultTool('search', args);

        const { url, init } = sentRequest(fetchMock);

        expect(url).toBe('http://obsidian-sync:8080/vault/search');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual(args);
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer internal-token');
    });

    it('marks an ok reply as a success and an error reply as a tool error', async () => {
        mockFetch(200, {
            status: 'ok',
            files: [],
        });
        expect(await callVaultTool('search', {})).toEqual({
            isError: false,
            body: {
                status: 'ok',
                files: [],
            },
        });

        const error = {
            status: 'error',
            code: 'conflict',
            message: 'changed',
        };

        mockFetch(409, error);
        expect(await callVaultTool('patch', {})).toEqual({
            isError: true,
            body: error,
        });
    });

    it('throws on a reply that is not a JSON object', async () => {
        mockFetch(502, [
            'not',
            'an object',
        ]);

        await expect(callVaultTool('list', {})).rejects.toThrow('not a JSON object');
    });
});

describe('the other obsidian-sync calls', () => {
    it('send the internal token too', async () => {
        const fetchMock = mockFetch(200, {
            status: 'ok',
            url: 'https://senaev.com',
        });

        await getShortLink('abc');

        const { url, init } = sentRequest(fetchMock);

        expect(url).toBe('http://obsidian-sync:8080/short_links/abc');
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer internal-token');
    });
});
