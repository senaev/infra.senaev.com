import { createHash } from 'node:crypto';

import Fastify, { FastifyInstance } from 'fastify';
import { httpRateLimit } from 'senaev-utils/src/utils/http/httpRateLimit';
import {
    afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createAuthorizationServer, LoginAttempt } from './authorizationServer';
import { createGoogleLogin } from './googleLogin';
import { oauthRoutes } from './registerOAuthRoutes';
import { createFakeGoogle, FakeGoogle } from './testing/fakeGoogle';

// HTTP policy is covered with the real plugin in senaev-utils. Route tests only
// need a few requests to check application-level error rendering and key isolation.
const requestPolicy = vi.hoisted(() => {
    return { max: 60 };
});

vi.mock(import('senaev-utils/src/utils/http/httpRateLimit.js'), async (importOriginal) => {
    const original = await importOriginal();

    return {
        httpRateLimit: vi.fn((key: string) => original.httpRateLimit(key, { max: () => requestPolicy.max })),
    };
});

const AUTH_DOMAIN = 'auth.example.com';
const MCP_DOMAIN = 'mcp.example.com';
const FORM_HEADERS = {
    host: AUTH_DOMAIN,
    'content-type': 'application/x-www-form-urlencoded',
};
const GOOGLE_CLIENT_ID = 'google-client-id';
const GOOGLE_EMAIL = 'admin@gmail.com';
const CODE_VERIFIER = 'v'.repeat(43);
const AUTHORIZE_QUERY = {
    response_type: 'code',
    client_id: 'https://chatgpt.com/oauth/client.json',
    redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    code_challenge: createHash('sha256').update(CODE_VERIFIER).digest('base64url'),
    code_challenge_method: 'S256',
    state: 'original-state',
};

let server: FastifyInstance;
let authorizationServer: ReturnType<typeof createAuthorizationServer>;
let fakeGoogle: FakeGoogle;
let loginAttempts: LoginAttempt[];

beforeAll(async () => {
    await createFakeGoogle(GOOGLE_CLIENT_ID);
});

beforeEach(async () => {
    requestPolicy.max = 60;
    vi.mocked(httpRateLimit).mockClear();
    server = Fastify();
    // Same catch-all as the public server: routes bound to another host must fall through to it.
    server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));
    loginAttempts = [];
    authorizationServer = createAuthorizationServer({
        issuer: `https://${AUTH_DOMAIN}`,
        resources: [
            `https://${MCP_DOMAIN}/mcp`,
            `https://${MCP_DOMAIN}/grafana`,
        ],
        username: 'andrei',
        password: 'secret-password',
        signingSecret: 'signing-secret',
        googleAdminEmails: new Set([GOOGLE_EMAIL]),
    });
    fakeGoogle = await createFakeGoogle(GOOGLE_CLIENT_ID);
    await server.register(oauthRoutes, {
        authorizationServer,
        googleLogin: createGoogleLogin({
            clientId: GOOGLE_CLIENT_ID,
            clientSecret: 'google-client-secret',
            redirectUri: `https://${AUTH_DOMAIN}/google/callback`,
            adminEmails: new Set([GOOGLE_EMAIL]),
            transactionSecret: 'signing-secret',
            fetch: fakeGoogle.fetch,
        }),
        onLoginAttempt: (attempt) => loginAttempts.push(attempt),
        authDomain: AUTH_DOMAIN,
        mcpDomain: MCP_DOMAIN,
        mcpPaths: [
            '/mcp',
            '/grafana',
        ],
    });
});

async function startGoogleLogin() {
    const response = await server.inject({
        url: `/google/start?${new URLSearchParams(AUTHORIZE_QUERY).toString()}`,
        headers: { host: AUTH_DOMAIN },
    });
    const [transactionCookie] = response.cookies;
    const google = new URL(String(response.headers.location));

    return {
        response,
        transactionCookie,
        state: String(google.searchParams.get('state')),
        nonce: String(google.searchParams.get('nonce')),
    };
}

function callGoogleCallback(query: Record<string, string>, cookie: { name: string; value: string } | undefined) {
    return server.inject({
        url: `/google/callback?${new URLSearchParams(query).toString()}`,
        headers: { host: AUTH_DOMAIN },
        ...(cookie !== undefined && { cookies: { [cookie.name]: cookie.value } }),
    });
}

function continueUrlOf(body: string): URL {
    const href = /<a href="([^" ]+)" rel="noreferrer">Return to the app<\/a>/.exec(body)?.[1];

    expect(href).toBeDefined();

    return new URL(String(href).replaceAll('&amp;', '&'));
}

afterEach(async () => {
    await server.close();
    vi.useRealTimers();
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

    it('serves the protected resource metadata on the MCP domain at the root and at each MCP path', async () => {
        const resourceByPath = {
            '/.well-known/oauth-protected-resource': `https://${MCP_DOMAIN}/mcp`,
            '/.well-known/oauth-protected-resource/mcp': `https://${MCP_DOMAIN}/mcp`,
            '/.well-known/oauth-protected-resource/grafana': `https://${MCP_DOMAIN}/grafana`,
        };

        for (const [
            url,
            resource,
        ] of Object.entries(resourceByPath)) {
            const response = await server.inject({
                url,
                headers: { host: MCP_DOMAIN },
            });

            expect(response.json()).toMatchObject({
                resource,
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
        expect(invalid.body).toContain('Return to the app with this error');
    });

    it('shows rate-limit errors and keeps token errors as JSON', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        requestPolicy.max = 1;
        expect(vi.mocked(httpRateLimit).mock.calls).toEqual([
            ['login'],
            ['google-start'],
            ['google-callback'],
            ['token'],
        ]);
        await server.inject({
            method: 'POST',
            url: '/authorize',
            headers: FORM_HEADERS,
            payload: '',
        });

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
        expect(response.body).toContain('Wait a minute');
        expect(response.body).toContain('Reference:');

        // A flood of password attempts does not lock Google sign-in.
        expect((await startGoogleLogin()).response.statusCode).toBe(302);

        await server.inject({
            method: 'POST',
            url: '/token',
            headers: FORM_HEADERS,
            payload: '',
        });

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
        const nonce = /script-src 'nonce-([^']+)'/.exec(String(response.headers['content-security-policy']))?.[1];

        expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        expect(response.body).toContain(`<script nonce="${nonce}">`);
        expect(response.body).toContain('window.location.assign(link.href)');
        expect(String(response.headers['content-security-policy'])).not.toContain('script-src \'unsafe-inline\'');
        expect(response.body).not.toContain('secret-password');
        expect(response.body).not.toContain('<form');
        expect(response.body).not.toContain('http-equiv="refresh"');
        const href = /<a href="([^" ]+)" rel="noreferrer">Return to the app<\/a>/.exec(response.body)?.[1];

        expect(href).toBeDefined();
        const location = new URL(String(href).replaceAll('&amp;', '&'));

        expect(location.origin).toBe('https://chatgpt.com');
        expect(location.searchParams.get('code')).toBeTruthy();
        expect(location.searchParams.get('state')).toBe('original-state');
        const anotherLogin = await server.inject({
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
            }).toString(),
        });

        expect(anotherLogin.headers['content-security-policy']).not.toBe(response.headers['content-security-policy']);
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

describe('Google sign-in routes', () => {
    it('shows the Google button and allows the redirect to Google in the CSP', async () => {
        const response = await server.inject({
            url: `/authorize?${new URLSearchParams(AUTHORIZE_QUERY).toString()}`,
            headers: { host: AUTH_DOMAIN },
        });

        expect(response.body).toContain('<form method="get" action="/google/start">');
        expect(response.body).toContain('Sign in with Google');
        expect(response.headers['content-security-policy']).toContain('form-action \'self\' https://chatgpt.com https://accounts.google.com');
    });

    it('checks the ChatGPT request again before it starts the Google flow', async () => {
        const response = await server.inject({
            url: `/google/start?${new URLSearchParams({
                ...AUTHORIZE_QUERY,
                redirect_uri: 'https://evil.example.com/callback',
            }).toString()}`,
            headers: { host: AUTH_DOMAIN },
        });

        expect(response.statusCode).toBe(400);
        expect(response.headers.location).toBeUndefined();
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.body).toContain('Unknown client or redirect URI');
    });

    it('redirects to Google with a Secure, HttpOnly, SameSite=Lax transaction cookie', async () => {
        const {
            response, transactionCookie, state,
        } = await startGoogleLogin();

        expect(response.statusCode).toBe(302);
        expect(String(response.headers.location)).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(transactionCookie).toMatchObject({
            name: `__Host-google-login-${state}`,
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'Lax',
            maxAge: 600,
        });
    });

    it('completes the original ChatGPT request for an allowed Google account', async () => {
        const {
            transactionCookie, state, nonce,
        } = await startGoogleLogin();

        fakeGoogle.setIdTokenClaims({
            nonce,
            email: GOOGLE_EMAIL,
            email_verified: true,
        });

        const callback = await callGoogleCallback({
            state,
            code: 'google-code',
        }, transactionCookie);

        expect(callback.statusCode).toBe(200);
        expect(callback.body).toContain('Signed in successfully');
        expect(callback.cookies).toContainEqual(expect.objectContaining({
            name: transactionCookie?.name,
            value: '',
        }));
        expect(loginAttempts).toEqual([
            {
                method: 'google',
                result: 'success',
                account: GOOGLE_EMAIL,
            },
        ]);

        const location = continueUrlOf(callback.body);

        expect(location.origin).toBe('https://chatgpt.com');
        expect(location.searchParams.get('state')).toBe('original-state');

        const token = await server.inject({
            method: 'POST',
            url: '/token',
            headers: FORM_HEADERS,
            payload: new URLSearchParams({
                grant_type: 'authorization_code',
                code: String(location.searchParams.get('code')),
                client_id: AUTHORIZE_QUERY.client_id,
                redirect_uri: AUTHORIZE_QUERY.redirect_uri,
                code_verifier: CODE_VERIFIER,
            }).toString(),
        });

        expect(token.statusCode).toBe(200);
        expect(token.json()).toMatchObject({ token_type: 'Bearer' });
    });

    it('shows the login form again for a denied account or cancelled consent', async () => {
        const denied = await startGoogleLogin();

        fakeGoogle.setIdTokenClaims({
            nonce: denied.nonce,
            email: 'stranger@gmail.com',
            email_verified: true,
        });

        const deniedCallback = await callGoogleCallback({
            state: denied.state,
            code: 'google-code',
        }, denied.transactionCookie);

        expect(deniedCallback.statusCode).toBe(401);
        expect(deniedCallback.body).toContain('This Google account is not allowed.');
        expect(deniedCallback.body).toContain('name="password"');
        expect(loginAttempts).toEqual([
            {
                method: 'google',
                result: 'denied',
                account: 'stranger@gmail.com',
            },
        ]);

        const cancelled = await startGoogleLogin();
        const cancelledCallback = await callGoogleCallback({
            state: cancelled.state,
            error: 'access_denied',
        }, cancelled.transactionCookie);

        expect(cancelledCallback.statusCode).toBe(401);
        expect(cancelledCallback.body).toContain('Google sign-in was cancelled.');
    });

    it('rejects a callback without its transaction cookie', async () => {
        const { state } = await startGoogleLogin();
        const callback = await callGoogleCallback({
            state,
            code: 'google-code',
        }, undefined);

        expect(callback.statusCode).toBe(400);
        expect(callback.body).toContain('The Google sign-in has expired or was started in another browser.');
        expect(fakeGoogle.tokenRequests).toHaveLength(0);
    });
});
