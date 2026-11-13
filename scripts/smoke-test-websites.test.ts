import {
    describe, expect, it,
} from 'vitest';

// Real requests to the public websites, run with `npm run test:smoke`, never with `npm test`.
// Together they cover each kind of public request, down to obsidian-sync.

const PAGES = [
    // Main page: firstvds Traefik (xray fallback) → nextjs-app.
    'https://senaev.ru/',
    // Main page: hetzner Traefik (xray fallback) → nextjs-app.
    'https://senaev.com/',
    // Static file: cluster-helper → obsidian-sync.
    'https://static.senaev.com/hello-world/',
    // Public note: nextjs-app → obsidian-sync.
    'https://senaev.com/notes/my_blog_post_senaev_speaks_12',
];

// Short link: cluster-helper → obsidian-sync.
const SHORT_LINK = {
    url: 'https://s.senaev.com/1bxsl9',
    location: 'https://senaev.com/cv/5min',
};

const REQUEST_TIMEOUT_MS = 15_000;

async function request(url: string): Promise<Response> {
    const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    await response.body?.cancel();

    return response;
}

describe('public websites', () => {
    it.concurrent.each(PAGES)('%s answers 200', async (url) => {
        const response = await request(url);

        expect(response.status).toBe(200);
    });

    it.concurrent(`${SHORT_LINK.url} redirects to ${SHORT_LINK.location}`, async () => {
        const response = await request(SHORT_LINK.url);

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(SHORT_LINK.location);
    });
});
