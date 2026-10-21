import Fastify from 'fastify';
import {
    expect, it, vi,
} from 'vitest';

import { createAuthorizationServer } from './authorizationServer';
import { createGoogleLogin } from './googleLogin';
import { oauthRoutes } from './registerOAuthRoutes';

// Security wiring check: keep the real default policy and plugin here. Fast route
// unit tests mock the policy, so they cannot detect a missing production limiter.
it('enforces the production OAuth threshold and independent windows with the real HTTP policy', async () => {
    const server = Fastify();
    const authDomain = 'auth.example.com';

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
        await server.register(oauthRoutes, {
            authDomain,
            mcpDomain: 'mcp.example.com',
            mcpPaths: ['/mcp'],
            authorizationServer: createAuthorizationServer({
                issuer: `https://${authDomain}`,
                resources: ['https://mcp.example.com/mcp'],
                username: 'test',
                password: 'test-password',
                signingSecret: 'test-only-secret',
                googleAdminEmails: new Set(),
            }),
            googleLogin: createGoogleLogin({
                clientId: 'test-client',
                clientSecret: 'test-secret',
                redirectUri: `https://${authDomain}/google/callback`,
                adminEmails: new Set(),
                transactionSecret: 'test-only-secret',
            }),
        });
        const post = (url: string) => server.inject({
            method: 'POST',
            url,
            payload: '',
            headers: {
                host: authDomain,
                'content-type': 'application/x-www-form-urlencoded',
            },
        });

        for (const url of [
            '/authorize',
            '/token',
        ]) {
            // Invalid requests must consume the same budget as valid requests.
            for (let attempt = 0; attempt < 60; attempt++) {
                const response = await post(url);

                expect(response.statusCode).toBe(400);
                expect(response.headers['x-ratelimit-limit']).toBe('60');
                expect(response.headers['x-ratelimit-remaining']).toBe(String(59 - attempt));
            }

            const blocked = await post(url);

            expect(blocked.statusCode).toBe(429);
            expect(blocked.headers['retry-after']).toBe('60');
        }

        expect((await server.inject({
            url: '/.well-known/oauth-authorization-server',
            headers: { host: authDomain },
        })).statusCode).toBe(200);
        vi.advanceTimersByTime(59_999);
        expect((await post('/authorize')).statusCode).toBe(429);
        vi.advanceTimersByTime(1);
        expect((await post('/authorize')).statusCode).toBe(400);
        expect((await post('/token')).statusCode).toBe(400);
    } finally {
        try {
            await server.close();
        } finally {
            vi.useRealTimers();
        }
    }
});
