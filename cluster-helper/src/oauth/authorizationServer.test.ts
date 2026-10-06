import { createHash } from 'node:crypto';

import {
    beforeEach, describe, expect, it,
} from 'vitest';

import { AuthorizationServer, createAuthorizationServer } from './authorizationServer';

const ISSUER = 'https://auth.example.com';
const RESOURCE = 'https://mcp.example.com/mcp';
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

let currentTime: number;
let server: AuthorizationServer;

function createServer(password = 'secret-password') {
    return createAuthorizationServer({
        issuer: ISSUER,
        resource: RESOURCE,
        username: 'andrei',
        password,
        signingSecret: 'signing-secret',
        now: () => currentTime,
    });
}

function redirectParams(location: string): URLSearchParams {
    const url = new URL(location);

    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URI);

    return url.searchParams;
}

function logIn(): string {
    const outcome = server.login({
        ...authorizeParams,
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

async function getTokens() {
    const { status, body } = await exchangeCode(logIn());

    expect(status).toBe(200);

    return body as { access_token: string; refresh_token: string };
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
});

describe('token', () => {
    it('exchanges a code for tokens that grant access to the resource', async () => {
        const { access_token: accessToken } = await getTokens();

        expect(await server.checkAccessToken(`Bearer ${accessToken}`)).toEqual({
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

        expect(await server.checkAccessToken(`Bearer ${refreshToken}`)).toEqual({ kind: 'invalid' });

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
        expect(await server.checkAccessToken(undefined)).toEqual({ kind: 'missing' });
        expect(await server.checkAccessToken('Basic abc')).toEqual({ kind: 'missing' });
    });

    it('rejects an expired access token', async () => {
        const { access_token: accessToken } = await getTokens();

        currentTime += 61 * 60_000;

        expect(await server.checkAccessToken(`Bearer ${accessToken}`)).toEqual({ kind: 'invalid' });
    });

    it('rejects every token after the password changes', async () => {
        const { access_token: accessToken } = await getTokens();

        expect(await createServer('new-password').checkAccessToken(`Bearer ${accessToken}`)).toEqual({ kind: 'invalid' });
    });
});
