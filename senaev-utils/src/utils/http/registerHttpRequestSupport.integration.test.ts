import Fastify from 'fastify';
import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { httpRateLimit } from './httpRateLimit';
import { registerHttpRequestSupport } from './registerHttpRequestSupport';

const server = Fastify();

afterEach(async () => {
    await server.close();
    vi.useRealTimers();
});

describe('HTTP request support', () => {
    it('parses forms/cookies and enforces independent rate windows without real sleeps', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        await server.register(async (scope) => {
            await registerHttpRequestSupport(scope);
            scope.post('/login', httpRateLimit('login', { max: 2 }), (request, reply) => reply
                .setCookie('session', 'test', { httpOnly: true })
                .send({
                    body: request.body,
                    cookie: request.cookies.input,
                }));
            scope.get('/unlimited-inside', () => {
                return { ok: true };
            });
            scope.post('/token', httpRateLimit('token', { max: 2 }), () => {
                return { ok: true };
            });
        });
        server.get('/unlimited', () => {
            return { ok: true };
        });
        const login = () => server.inject({
            method: 'POST',
            url: '/login',
            payload: 'name=hello%20world',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                cookie: 'input=sample',
            },
        });
        const first = await login();

        expect(first.json()).toEqual({
            body: { name: 'hello world' },
            cookie: 'sample',
        });
        expect(first.headers['set-cookie']).toContain('session=test');
        expect(first.headers['x-ratelimit-limit']).toBe('2');
        expect((await login()).statusCode).toBe(200);
        const blocked = await login();

        expect(blocked.statusCode).toBe(429);
        expect(blocked.headers['retry-after']).toBe('60');
        expect(blocked.json()).toMatchObject({ statusCode: 429 });
        expect((await server.inject({
            method: 'POST',
            url: '/token',
        })).statusCode).toBe(200);
        vi.advanceTimersByTime(59_999);
        expect((await login()).statusCode).toBe(429);
        vi.advanceTimersByTime(1);
        expect((await login()).statusCode).toBe(200);
        for (const url of [
            '/unlimited-inside',
            '/unlimited',
        ]) {
            const unlimited = await server.inject(url);

            expect(unlimited.statusCode).toBe(200);
            expect(unlimited.headers['x-ratelimit-limit']).toBeUndefined();
        }
    });
});
