import { createHash, createHmac } from 'node:crypto';

import { decodeJwt, SignJWT } from 'jose';
import {
    beforeEach, describe, expect, it,
} from 'vitest';

import {
    AuthorizationServer, AuthorizeRequest, createAuthorizationServer,
} from './authorizationServer';

const ISSUER = 'https://auth.example.com';
const RESOURCE = 'https://mcp.example.com/mcp';
const OTHER_RESOURCE = 'https://mcp.example.com/grafana';
const CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CODE_VERIFIER = 'a'.repeat(43);
const CODE_CHALLENGE = createHash('sha256').update(CODE_VERIFIER).digest('base64url');

const authorizeParams = {
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: 'state-1',
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    resource: RESOURCE,
};

const GOOGLE_EMAIL = 'admin@gmail.com';

let currentTime: number;
let server: AuthorizationServer;

function createServer(signingSecret = 'signing-secret', googleAdminEmails: string[] = [GOOGLE_EMAIL]) {
    return createAuthorizationServer({
        issuer: ISSUER,
        resources: [
            RESOURCE,
            OTHER_RESOURCE,
        ],
        signingSecret,
        googleAdminEmails: new Set(googleAdminEmails),
        now: () => currentTime,
    });
}

function redirectParams(location: string): URLSearchParams {
    const url = new URL(location);

    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URI);

    return url.searchParams;
}

function checkedRequest(resource = RESOURCE): AuthorizeRequest {
    const outcome = server.authorize({
        ...authorizeParams,
        resource,
    });

    if (outcome.kind !== 'show-login') {
        throw new Error(`Expected show-login, got ${outcome.kind}`);
    }

    return outcome.request;
}

// What the Google callback does after Google confirmed an allowed email.
function logIn(resource = RESOURCE): string {
    const outcome = server.completeAuthorization(checkedRequest(resource), {
        method: 'google',
        email: GOOGLE_EMAIL,
    });

    if (outcome.kind !== 'redirect') {
        throw new Error(`Expected a redirect, got ${outcome.kind}`);
    }

    const params = redirectParams(outcome.location);

    expect(params.get('state')).toBe('state-1');
    expect(params.get('iss')).toBe(ISSUER);

    return params.get('code') ?? '';
}

function exchangeCode(code: string, overrides: Record<string, string> = {}) {
    return server.token({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: CODE_VERIFIER,
        resource: RESOURCE,
        ...overrides,
    });
}

async function getTokens(resource = RESOURCE) {
    const { status, body } = await exchangeCode(logIn(resource), { resource });

    expect(status).toBe(200);

    return body as { access_token: string; refresh_token: string };
}

function refresh(refreshToken: string, onServer = server) {
    return onServer.token({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
    });
}

beforeEach(() => {
    currentTime = Date.UTC(2026, 9, 6);
    server = createServer();
});

describe('authorize', () => {
    it('asks for the login form for a valid ChatGPT request', () => {
        expect(server.authorize(authorizeParams)).toMatchObject({
            kind: 'show-login',
            request: {
                clientId: CLIENT_ID,
                state: 'state-1',
                resource: RESOURCE,
            },
        });
    });

    it('accepts the callback-specific ChatGPT client with its own redirect URI', () => {
        expect(server.authorize({
            ...authorizeParams,
            client_id: 'https://chatgpt.com/oauth/abc-123/client.json',
            redirect_uri: 'https://chatgpt.com/connector/oauth/abc-123',
        }).kind).toBe('show-login');
    });

    it('accepts the OpenCode client with a loopback redirect URI on any port', () => {
        for (const redirectUri of [
            'http://127.0.0.1:19876/mcp/oauth/callback',
            'http://127.0.0.1:53124/callback',
            'http://localhost:53124/callback',
        ]) {
            expect(server.authorize({
                ...authorizeParams,
                client_id: 'https://opencode.ai/oauth/opencode/client.json',
                redirect_uri: redirectUri,
            }).kind).toBe('show-login');
        }
    });

    it('rejects the OpenCode client with a redirect URI that is not its loopback callback', () => {
        for (const redirectUri of [
            'https://evil.example.com/callback',
            'http://127.0.0.1.evil.example.com/callback',
            'http://127.0.0.1:53124/other',
            'http://localhost:53124/mcp/oauth/callback',
            'https://127.0.0.1:53124/callback',
        ]) {
            expect(server.authorize({
                ...authorizeParams,
                client_id: 'https://opencode.ai/oauth/opencode/client.json',
                redirect_uri: redirectUri,
            }).kind).toBe('reject');
        }
    });

    it('accepts the static OpenCode client only with the public callback of opencode.senaev.com', () => {
        const authorize = (redirectUri: string) => server.authorize({
            ...authorizeParams,
            client_id: 'opencode.senaev.com',
            redirect_uri: redirectUri,
        }).kind;

        expect(authorize('https://opencode.senaev.com/auth/mcp/callback')).toBe('show-login');

        for (const redirectUri of [
            'http://127.0.0.1:4100/auth/mcp/callback',
            'https://opencode.senaev.com/auth/mcp/callback/',
            'https://opencode.senaev.com.evil.example.com/auth/mcp/callback',
            'https://omp.senaev.com/auth/mcp/callback',
        ]) {
            expect(authorize(redirectUri)).toBe('reject');
        }
    });

    it('does not accept the public OpenCode callback with the CIMD client id of OpenCode', () => {
        expect(server.authorize({
            ...authorizeParams,
            client_id: 'https://opencode.ai/oauth/opencode/client.json',
            redirect_uri: 'https://opencode.senaev.com/auth/mcp/callback',
        }).kind).toBe('reject');
    });

    it('accepts the Claude Code client with a loopback /callback redirect URI on any port', () => {
        for (const redirectUri of [
            'http://localhost:64564/callback',
            'http://127.0.0.1:64564/callback',
            'http://localhost/callback',
        ]) {
            expect(server.authorize({
                ...authorizeParams,
                client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
                redirect_uri: redirectUri,
            }).kind).toBe('show-login');
        }
    });

    it('rejects the Claude Code client with a redirect URI that is not its loopback callback', () => {
        for (const redirectUri of [
            'https://evil.example.com/callback',
            'http://localhost.evil.example.com/callback',
            'http://localhost:64564/mcp/oauth/callback',
            'https://localhost:64564/callback',
            'http://localhost:64564/callback?x=1',
        ]) {
            expect(server.authorize({
                ...authorizeParams,
                client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
                redirect_uri: redirectUri,
            }).kind).toBe('reject');
        }
    });

    it('rejects other clients and redirect URIs without redirecting', () => {
        expect(server.authorize({
            ...authorizeParams,
            client_id: 'https://evil.example.com/client.json',
        }).kind).toBe('reject');
        expect(server.authorize({
            ...authorizeParams,
            redirect_uri: 'https://evil.example.com/callback',
        }).kind).toBe('reject');
        expect(server.authorize({
            ...authorizeParams,
            client_id: 'https://chatgpt.com/oauth/abc-123/client.json',
            redirect_uri: 'https://chatgpt.com/connector/oauth/other',
        }).kind).toBe('reject');
    });

    it('redirects an error with iss when PKCE is missing or the resource is wrong', () => {
        for (const params of [
            {
                ...authorizeParams,
                code_challenge_method: 'plain',
            },
            {
                ...authorizeParams,
                resource: 'https://other.example.com',
            },
        ]) {
            const outcome = server.authorize(params);

            expect(outcome.kind).toBe('redirect');

            const query = redirectParams(outcome.kind === 'redirect' ? outcome.location : '');

            expect(query.get('error')).not.toBeNull();
            expect(query.get('iss')).toBe(ISSUER);
            expect(query.get('code')).toBeNull();
        }
    });
});

describe('Google login', () => {
    it('issues tokens for the same account with a hashed email, not the plain email', async () => {
        const { access_token: accessToken, refresh_token: refreshToken } = await getTokens();

        expect(await server.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({
            kind: 'valid',
            subject: 'owner',
        });

        for (const token of [
            accessToken,
            refreshToken,
        ]) {
            expect(decodeJwt(token)).toMatchObject({
                sub: 'owner',
                idp: 'google',
                email_hash: expect.stringMatching(/^[\w-]{43}$/),
            });
            expect(JSON.stringify(decodeJwt(token))).not.toContain('admin');
        }
    });

    it('keeps the provenance on refresh while the email is allowed', async () => {
        const { refresh_token: refreshToken } = await getTokens();
        const { status, body } = await refresh(refreshToken);

        expect(status).toBe(200);
        expect(decodeJwt(String((body as { refresh_token: string }).refresh_token))).toMatchObject({ idp: 'google' });
    });

    it('rejects the refresh after the email is removed, but keeps the access token until it expires', async () => {
        const { access_token: accessToken, refresh_token: refreshToken } = await getTokens();
        const serverWithoutEmail = createServer('signing-secret', ['other@gmail.com']);

        expect((await refresh(refreshToken, serverWithoutEmail)).body).toMatchObject({ error: 'invalid_grant' });
        expect(await serverWithoutEmail.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toMatchObject({ kind: 'valid' });
    });

    it('rejects the tokens of the removed password login, signed with the key that depended on the password', async () => {
        const oldKey = createHmac('sha256', 'signing-secret').update('secret-password').digest();
        const sign = (type: string) => new SignJWT({
            client_id: CLIENT_ID,
            scope: 'mcp',
        })
            .setProtectedHeader({
                alg: 'HS256',
                typ: type,
            })
            .setIssuer(ISSUER)
            .setAudience(RESOURCE)
            .setSubject('andrei')
            .setIssuedAt(Math.floor(currentTime / 1000))
            .setExpirationTime(Math.floor(currentTime / 1000) + 3600)
            .sign(oldKey);

        expect(await server.checkAccessToken(`Bearer ${await sign('at+jwt')}`, RESOURCE)).toEqual({ kind: 'invalid' });
        expect((await refresh(await sign('refresh+jwt'))).body).toMatchObject({ error: 'invalid_grant' });
    });
});

describe('token', () => {
    it('exchanges a code for tokens that grant access to the resource', async () => {
        const { access_token: accessToken } = await getTokens();

        expect(await server.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({
            kind: 'valid',
            subject: 'owner',
        });
    });

    it('accepts a code only once', async () => {
        const code = logIn();

        expect((await exchangeCode(code)).status).toBe(200);
        expect((await exchangeCode(code)).body).toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects an expired code', async () => {
        const code = logIn();

        currentTime += 61_000;

        expect((await exchangeCode(code)).body).toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects a wrong PKCE verifier, redirect URI or resource', async () => {
        for (const overrides of [
            { code_verifier: 'b'.repeat(43) },
            { redirect_uri: 'https://chatgpt.com/connector/oauth/other' },
            { resource: 'https://other.example.com' },
        ]) {
            expect((await exchangeCode(logIn(), overrides)).body).toMatchObject({ error: 'invalid_grant' });
        }
    });

    it('issues new tokens for a refresh token, but never accepts it as an access token', async () => {
        const { refresh_token: refreshToken } = await getTokens();

        expect(await server.checkAccessToken(`Bearer ${refreshToken}`, RESOURCE)).toEqual({ kind: 'invalid' });

        const { status, body } = await server.token({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
        });

        expect(status).toBe(200);
        expect(body).toHaveProperty('access_token');
    });

    it('rejects an unsupported grant type', async () => {
        expect((await server.token({ grant_type: 'client_credentials' })).body).toMatchObject({ error: 'unsupported_grant_type' });
    });
});

describe('checkAccessToken', () => {
    it('reports a missing or malformed header as missing', async () => {
        expect(await server.checkAccessToken(undefined, RESOURCE)).toEqual({ kind: 'missing' });
        expect(await server.checkAccessToken('Basic abc', RESOURCE)).toEqual({ kind: 'missing' });
    });

    it('rejects an expired access token', async () => {
        const { access_token: accessToken } = await getTokens();

        currentTime += 61 * 60_000;

        expect(await server.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({ kind: 'invalid' });
    });

    it('rejects every token after the signing secret changes', async () => {
        const { access_token: accessToken } = await getTokens();

        expect(await createServer('new-signing-secret').checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({ kind: 'invalid' });
    });
});

describe('several resources', () => {
    it('issues a token for the requested resource, valid only for that resource', async () => {
        const { access_token: accessToken } = await getTokens(OTHER_RESOURCE);

        expect(decodeJwt(accessToken)).toMatchObject({ aud: OTHER_RESOURCE });
        expect(await server.checkAccessToken(`Bearer ${accessToken}`, OTHER_RESOURCE)).toMatchObject({ kind: 'valid' });
        expect(await server.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({ kind: 'invalid' });
    });

    it('rejects a token of the first resource on the other one', async () => {
        const { access_token: accessToken } = await getTokens();

        expect(await server.checkAccessToken(`Bearer ${accessToken}`, OTHER_RESOURCE)).toEqual({ kind: 'invalid' });
    });

    it('uses the first resource when the client sends none', () => {
        const { resource: _resource, ...paramsWithoutResource } = authorizeParams;

        expect(server.authorize(paramsWithoutResource)).toMatchObject({
            kind: 'show-login',
            request: { resource: RESOURCE },
        });
    });

    it('keeps the resource of the refresh token, whatever resource the refresh asks for', async () => {
        const { refresh_token: refreshToken } = await getTokens(OTHER_RESOURCE);
        const { body } = await server.token({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
            resource: RESOURCE,
        });
        const accessToken = String((body as { access_token: string }).access_token);

        expect(decodeJwt(accessToken)).toMatchObject({ aud: OTHER_RESOURCE });
        expect(await server.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({ kind: 'invalid' });
    });

    it('keeps accepting tokens issued by a server that knew only the first resource', async () => {
        const { access_token: accessToken, refresh_token: refreshToken } = await getTokens();
        const singleResourceServer = createAuthorizationServer({
            issuer: ISSUER,
            resources: [RESOURCE],
            signingSecret: 'signing-secret',
            googleAdminEmails: new Set([GOOGLE_EMAIL]),
            now: () => currentTime,
        });

        expect(await singleResourceServer.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toMatchObject({ kind: 'valid' });
        expect((await refresh(refreshToken, singleResourceServer)).status).toBe(200);
    });

    it('rejects a token for a resource that the server no longer knows', async () => {
        const { refresh_token: refreshToken } = await getTokens(OTHER_RESOURCE);
        const singleResourceServer = createAuthorizationServer({
            issuer: ISSUER,
            resources: [RESOURCE],
            signingSecret: 'signing-secret',
            googleAdminEmails: new Set([GOOGLE_EMAIL]),
            now: () => currentTime,
        });

        expect((await refresh(refreshToken, singleResourceServer)).body).toMatchObject({ error: 'invalid_grant' });
    });

    it('describes each resource in its metadata', () => {
        expect(server.protectedResourceMetadata(OTHER_RESOURCE)).toMatchObject({
            resource: OTHER_RESOURCE,
            authorization_servers: [ISSUER],
        });
    });
});
