import { createHash } from 'node:crypto';

import { decodeJwt } from 'jose';
import {
    beforeEach, describe, expect, it,
} from 'vitest';

import {
    AuthorizationServer, AuthorizeRequest, createAuthorizationServer, LoginAttempt,
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
let loginAttempts: LoginAttempt[];

function createServer(password = 'secret-password', googleAdminEmails: string[] = [GOOGLE_EMAIL]) {
    return createAuthorizationServer({
        issuer: ISSUER,
        resources: [
            RESOURCE,
            OTHER_RESOURCE,
        ],
        username: 'andrei',
        password,
        signingSecret: 'signing-secret',
        googleAdminEmails: new Set(googleAdminEmails),
        onLoginAttempt: (attempt) => loginAttempts.push(attempt),
        now: () => currentTime,
    });
}

function redirectParams(location: string): URLSearchParams {
    const url = new URL(location);

    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URI);

    return url.searchParams;
}

function logIn(resource = RESOURCE): string {
    const outcome = server.login({
        ...authorizeParams,
        resource,
        username: 'andrei',
        password: 'secret-password',
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

function checkedRequest(): AuthorizeRequest {
    const outcome = server.authorize(authorizeParams);

    if (outcome.kind !== 'show-login') {
        throw new Error(`Expected show-login, got ${outcome.kind}`);
    }

    return outcome.request;
}

async function getGoogleTokens() {
    const outcome = server.completeAuthorization(checkedRequest(), {
        method: 'google',
        email: GOOGLE_EMAIL,
    });
    const code = redirectParams(outcome.kind === 'redirect' ? outcome.location : '').get('code') ?? '';
    const { status, body } = await exchangeCode(code);

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
    loginAttempts = [];
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

describe('login', () => {
    it('shows the form again with an error for wrong credentials', () => {
        expect(server.login({
            ...authorizeParams,
            username: 'andrei',
            password: 'wrong',
        })).toMatchObject({
            kind: 'show-login',
            error: 'Incorrect username or password.',
        });
    });

    it('reports every password attempt with the given username, never the password', async () => {
        server.login({
            ...authorizeParams,
            username: 'guess',
            password: 'wrong',
        });
        await getTokens();

        expect(loginAttempts).toEqual([
            {
                method: 'password',
                result: 'denied',
                account: 'guess',
            },
            {
                method: 'password',
                result: 'success',
                account: 'andrei',
            },
        ]);
    });
});

describe('Google login', () => {
    it('issues tokens for the same account with a hashed email, not the plain email', async () => {
        const { access_token: accessToken, refresh_token: refreshToken } = await getGoogleTokens();

        expect(await server.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({
            kind: 'valid',
            subject: 'andrei',
        });

        for (const token of [
            accessToken,
            refreshToken,
        ]) {
            expect(decodeJwt(token)).toMatchObject({
                sub: 'andrei',
                idp: 'google',
                email_hash: expect.stringMatching(/^[\w-]{43}$/),
            });
            expect(JSON.stringify(decodeJwt(token))).not.toContain('admin');
        }
    });

    it('keeps the provenance on refresh while the email is allowed', async () => {
        const { refresh_token: refreshToken } = await getGoogleTokens();
        const { status, body } = await refresh(refreshToken);

        expect(status).toBe(200);
        expect(decodeJwt(String((body as { refresh_token: string }).refresh_token))).toMatchObject({ idp: 'google' });
    });

    it('rejects the refresh after the email is removed, but keeps the access token until it expires', async () => {
        const { access_token: accessToken, refresh_token: refreshToken } = await getGoogleTokens();
        const serverWithoutEmail = createServer('secret-password', ['other@gmail.com']);

        expect((await refresh(refreshToken, serverWithoutEmail)).body).toMatchObject({ error: 'invalid_grant' });
        expect(await serverWithoutEmail.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toMatchObject({ kind: 'valid' });
    });

    it('keeps refreshing password tokens whatever the allowlist', async () => {
        const { refresh_token: refreshToken } = await getTokens();

        expect(decodeJwt(refreshToken)).not.toHaveProperty('idp');
        expect((await refresh(refreshToken, createServer('secret-password', []))).status).toBe(200);
    });
});

describe('token', () => {
    it('exchanges a code for tokens that grant access to the resource', async () => {
        const { access_token: accessToken } = await getTokens();

        expect(await server.checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({
            kind: 'valid',
            subject: 'andrei',
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

    it('rejects every token after the password changes', async () => {
        const { access_token: accessToken } = await getTokens();

        expect(await createServer('new-password').checkAccessToken(`Bearer ${accessToken}`, RESOURCE)).toEqual({ kind: 'invalid' });
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
            username: 'andrei',
            password: 'secret-password',
            signingSecret: 'signing-secret',
            googleAdminEmails: new Set(),
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
            username: 'andrei',
            password: 'secret-password',
            signingSecret: 'signing-secret',
            googleAdminEmails: new Set(),
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
