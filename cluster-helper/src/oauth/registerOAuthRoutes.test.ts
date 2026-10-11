import { createHash } from 'node:crypto';

import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createAuthorizationServer } from './authorizationServer';
import { oauthRoutes } from './registerOAuthRoutes';

const AUTH_DOMAIN = 'auth.example.com';
const MCP_DOMAIN = 'mcp.example.com';
const FORM_HEADERS = {
    host: AUTH_DOMAIN,
    'content-type': 'application/x-www-form-urlencoded',
};

let server: FastifyInstance;
let authorizationServer: ReturnType<typeof createAuthorizationServer>;

beforeEach(async () => {
    server = Fastify();
    // Same catch-all as the public server: routes bound to another host must fall through to it.
    server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));
    authorizationServer = createAuthorizationServer({
        issuer: `https://${AUTH_DOMAIN}`,
        resource: `https://${MCP_DOMAIN}/mcp`,
        username: 'andrei',
        password: 'secret-password',
        signingSecret: 'signing-secret',
    });
    await server.register(oauthRoutes, {
        authorizationServer,
        authDomain: AUTH_DOMAIN,
        mcpDomain: MCP_DOMAIN,
        mcpPath: '/mcp',
    });
});

afterEach(async () => {
    await server.close();
});

describe('registerOAuthRoutes', () => {
    it('serves the authorization server metadata only on the auth domain', async () => {
        const onAuthDomain = await server.inject({
            url: '/.well-known/oauth-authorization-server',
            headers: { host: AUTH_DOMAIN },
        });

        expect(onAuthDomain.statusCode).toBe(200);
        expect(onAuthDomain.json()).toMatchObject({ issuer: `https://${AUTH_DOMAIN}` });

        const onOtherDomain = await server.inject({
            url: '/.well-known/oauth-authorization-server',
            headers: { host: MCP_DOMAIN },
        });

        expect(onOtherDomain.statusCode).toBe(401);
    });

    it('serves the protected resource metadata on the MCP domain at both paths', async () => {
        const paths = [
            '/.well-known/oauth-protected-resource',
            '/.well-known/oauth-protected-resource/mcp',
        ];

        for (const url of paths) {
            const response = await server.inject({
                url,
                headers: { host: MCP_DOMAIN },
            });

            expect(response.json()).toMatchObject({
                resource: `https://${MCP_DOMAIN}/mcp`,
                authorization_servers: [`https://${AUTH_DOMAIN}`],
            });
        }
    });

    it('shows rejected and protocol errors locally without automatic redirection', async () => {
        const rejected = await server.inject({
            url: '/authorize?client_id=%3Cscript%3E',
            headers: { host: AUTH_DOMAIN },
        });

        expect(rejected.statusCode).toBe(400);
        expect(rejected.headers['content-type']).toContain('text/html');
        expect(rejected.body).toContain('role="alert"');
        expect(rejected.body).toContain('Unknown client or redirect URI');
        expect(rejected.body).not.toContain('<script>');

        const invalid = await server.inject({
            method: 'POST',
            url: '/authorize',
            headers: FORM_HEADERS,
            payload: new URLSearchParams({
                client_id: 'https://chatgpt.com/oauth/client.json',
                redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
                response_type: 'unsupported',
                state: 'original-state',
            }).toString(),
        });

        expect(invalid.statusCode).toBe(400);
        expect(invalid.headers.location).toBeUndefined();
        expect(invalid.body).toContain('Only response_type=code is supported');
        expect(invalid.body).toContain('state=original-state');
        expect(invalid.body).toContain('Return to ChatGPT with this error');
    });

    it('shows rate-limit errors and keeps token errors as JSON', async () => {
        for (let attempt = 0; attempt < 10; attempt++) {
            await server.inject({
                method: 'POST',
                url: '/authorize',
                headers: FORM_HEADERS,
                payload: '',
            });
        }

        const response = await server.inject({
            method: 'POST',
            url: '/authorize',
            headers: FORM_HEADERS,
            payload: '',
        });

        expect(response.statusCode).toBe(429);
        expect(response.headers['retry-after']).toBeDefined();
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['content-security-policy']).toContain('frame-ancestors \'none\'');
        expect(response.body).toContain('Wait 15 minutes');
        expect(response.body).toContain('Reference:');

        for (let attempt = 0; attempt < 60; attempt++) {
            await server.inject({
                method: 'POST',
                url: '/token',
                headers: FORM_HEADERS,
                payload: '',
            });
        }

        const token = await server.inject({
            method: 'POST',
            url: '/token',
            headers: FORM_HEADERS,
            payload: '',
        });

        expect(token.statusCode).toBe(429);
        expect(token.headers['content-type']).toContain('application/json');
    });

    it('shows a safe internal error without disclosing exception details', async () => {
        vi.spyOn(authorizationServer, 'login').mockImplementation(() => {
            throw new Error('private-secret');
        });
        const response = await server.inject({
            method: 'POST',
            url: '/authorize',
            headers: FORM_HEADERS,
            payload: '',
        });

        expect(response.statusCode).toBe(500);
        expect(response.body).toContain('Sign-in is temporarily unavailable');
        expect(response.body).not.toContain('private-secret');
    });

    it('shows a successful login with a usable validated callback link', async () => {
        const verifier = 'v'.repeat(43);
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        const response = await server.inject({
            method: 'POST',
            url: '/authorize',
            headers: FORM_HEADERS,
            payload: new URLSearchParams({
                response_type: 'code',
                client_id: 'https://chatgpt.com/oauth/client.json',
                redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
                code_challenge: challenge,
                code_challenge_method: 'S256',
                username: 'andrei',
                password: 'secret-password',
                state: 'original-state',
            }).toString(),
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.headers['content-security-policy']).toContain('form-action');
        expect(response.body).toContain('Signed in successfully');
        expect(response.body).not.toContain('secret-password');
        expect(response.body).not.toContain('<form');
        expect(response.body).not.toContain('http-equiv="refresh"');
        const href = /<a href="([^" ]+)" rel="noreferrer">Return to ChatGPT<\/a>/.exec(response.body)?.[1];

        expect(href).toBeDefined();
        const location = new URL(String(href).replaceAll('&amp;', '&'));

        expect(location.origin).toBe('https://chatgpt.com');
        expect(location.searchParams.get('code')).toBeTruthy();
        expect(location.searchParams.get('state')).toBe('original-state');
        const token = await server.inject({
            method: 'POST',
            url: '/token',
            headers: FORM_HEADERS,
            payload: new URLSearchParams({
                grant_type: 'authorization_code',
                code: String(location.searchParams.get('code')),
                client_id: 'https://chatgpt.com/oauth/client.json',
                redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
                code_verifier: verifier,
            }).toString(),
        });

        expect(token.statusCode).toBe(200);
        expect(token.json()).toMatchObject({ token_type: 'Bearer' });
    });

    it('parses the form-encoded login and token requests', async () => {
        const login = await server.inject({
            method: 'POST',
            url: '/authorize',
            headers: FORM_HEADERS,
            payload: new URLSearchParams({
                response_type: 'code',
                client_id: 'https://chatgpt.com/oauth/client.json',
                redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
                code_challenge: 'x'.repeat(43),
                code_challenge_method: 'S256',
                username: 'andrei',
                password: 'wrong',
            }).toString(),
        });

        expect(login.statusCode).toBe(401);
        expect(login.headers['content-type']).toContain('text/html');
        expect(login.headers['content-security-policy']).toContain('frame-ancestors \'none\'');
        expect(login.body).toContain('Incorrect username or password.');

        const token = await server.inject({
            method: 'POST',
            url: '/token',
            headers: FORM_HEADERS,
            payload: 'grant_type=authorization_code&code=unknown',
        });

        expect(token.statusCode).toBe(400);
        expect(token.json()).toMatchObject({ error: 'invalid_grant' });
    });
});
