import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { createObsidianSyncApi } from './obsidianSyncApi';

const mtlsFetchMock = vi.fn();

const { callVaultTool, getShortLink } = createObsidianSyncApi({ fetch: mtlsFetchMock });

function mockFetch(status: number, body: unknown) {
    mtlsFetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

    return mtlsFetchMock;
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
    mtlsFetchMock.mockReset();
});

describe('callVaultTool', () => {
    it('posts the arguments unchanged to /vault/<tool> through the mTLS client, with no token', async () => {
        const fetchMock = mockFetch(200, { status: 'ok' });
        const args = { queries: ['gym'] };

        await callVaultTool('search', args);

        const { url, init } = sentRequest(fetchMock);

        expect(url).toBe('https://obsidian-sync.senaev-com.svc.cluster.local:8443/vault/search');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual(args);
        expect((init.headers as Record<string, string>).authorization).toBeUndefined();
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
    it('go through the mTLS client too', async () => {
        const fetchMock = mockFetch(200, {
            status: 'ok',
            url: 'https://senaev.com',
        });

        await getShortLink('abc');

        const { url } = sentRequest(fetchMock);

        expect(url).toBe('https://obsidian-sync.senaev-com.svc.cluster.local:8443/short_links/abc');
    });
});

describe('file-reference forwarding', () => {
    it('posts the small file reference as JSON without embedding file bytes', async () => {
        const fetchMock = mockFetch(200, {
            status: 'ok',
            path: 'finances/a.pdf',
        });
        const args = {
            path: 'finances/a.pdf',
            file: {
                file_id: 'file_a',
                download_url: 'https://files.oaiusercontent.com/a',
            },
        };

        await callVaultTool('upload', args);
        const { url, init } = sentRequest(fetchMock);

        expect(url).toBe('https://obsidian-sync.senaev-com.svc.cluster.local:8443/vault/upload');
        expect(JSON.parse(init.body as string)).toEqual(args);
    });
});
