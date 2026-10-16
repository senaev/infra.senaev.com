import {
    beforeEach, describe, expect, it,
} from 'vitest';

import type { AuthorizeRequest } from './authorizationServer';
import {
    createGoogleLogin, GoogleLogin, GoogleLoginStart, parseGoogleAdminEmails,
} from './googleLogin';
import { createFakeGoogle, FakeGoogle } from './testing/fakeGoogle';

const CLIENT_ID = 'google-client-id';
const REDIRECT_URI = 'https://auth.example.com/google/callback';
const ADMIN_EMAIL = 'admin@gmail.com';

const request: AuthorizeRequest = {
    clientId: 'https://chatgpt.com/oauth/client.json',
    redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    state: 'chatgpt-state',
    codeChallenge: 'c'.repeat(43),
    resource: 'https://mcp.example.com/mcp',
};

let currentTime: number;
let fakeGoogle: FakeGoogle;
let googleLogin: GoogleLogin;

beforeEach(async () => {
    currentTime = Date.now();
    fakeGoogle = await createFakeGoogle(CLIENT_ID);
    googleLogin = createGoogleLogin({
        clientId: CLIENT_ID,
        clientSecret: 'google-client-secret',
        redirectUri: REDIRECT_URI,
        adminEmails: new Set([ADMIN_EMAIL]),
        transactionSecret: 'transaction-secret',
        fetch: fakeGoogle.fetch,
        now: () => currentTime,
    });
});

function googleParams(start: GoogleLoginStart): URLSearchParams {
    return new URL(start.authorizationUrl).searchParams;
}

/** What Google sends back to the callback after a successful consent. */
function callbackQuery(start: GoogleLoginStart, extra: Record<string, string> = {}): URLSearchParams {
    return new URLSearchParams({
        state: String(googleParams(start).get('state')),
        code: 'google-code',
        ...extra,
    });
}

function cookiesOf(start: GoogleLoginStart): Record<string, string> {
    return { [start.cookie.name]: start.cookie.value };
}

async function finishWithClaims(claims: Record<string, unknown>) {
    const start = await googleLogin.start(request);

    fakeGoogle.setIdTokenClaims({
        nonce: googleParams(start).get('nonce'),
        ...claims,
    });

    return (await googleLogin.finish(callbackQuery(start), cookiesOf(start))).result;
}

describe('parseGoogleAdminEmails', () => {
    it('trims and lowercases every entry', () => {
        expect(parseGoogleAdminEmails(' Admin@Gmail.com , other.name@gmail.com')).toEqual(new Set([
            'admin@gmail.com',
            'other.name@gmail.com',
        ]));
    });

    it('rejects empty entries and addresses that are not Gmail', () => {
        for (const value of [
            '',
            'admin@gmail.com,',
            'admin@example.com',
            'admin@gmail.com.evil.com',
            'not-an-email',
        ]) {
            expect(() => parseGoogleAdminEmails(value)).toThrow(/GOOGLE_OAUTH_ADMIN_EMAILS/);
        }
    });
});

describe('start', () => {
    it('builds a Google authorization URL with PKCE, state and nonce', async () => {
        const start = await googleLogin.start(request);
        const url = new URL(start.authorizationUrl);

        expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: 'openid email',
            code_challenge_method: 'S256',
        });
        expect(url.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
        expect(url.searchParams.get('nonce')).toBeTruthy();
        expect(url.searchParams.get('code_challenge')).toBeTruthy();
        // Google's state is its own, never ChatGPT's.
        expect(url.searchParams.get('state')).not.toBe(request.state);
    });

    it('keeps the transaction in a cookie named by the state, with unreadable content', async () => {
        const start = await googleLogin.start(request);

        expect(start.cookie.name).toBe(`__Host-google-login-${googleParams(start).get('state')}`);
        expect(start.cookie.maxAgeSeconds).toBe(600);
        expect(start.cookie.value).not.toContain('chatgpt');
        expect(Buffer.from(start.cookie.value.split('.')[3] ?? '', 'base64url').toString()).not.toContain('chatgpt');
    });
});

describe('finish', () => {
    it('allows a verified admin Gmail account and returns the original request', async () => {
        expect(await finishWithClaims({
            email: 'Admin@Gmail.com',
            email_verified: true,
        })).toEqual({
            kind: 'allowed',
            request,
            email: ADMIN_EMAIL,
        });

        const [tokenRequest] = fakeGoogle.tokenRequests;

        expect(tokenRequest?.get('code')).toBe('google-code');
        expect(tokenRequest?.get('code_verifier')).toBeTruthy();
        expect(tokenRequest?.get('redirect_uri')).toBe(REDIRECT_URI);
    });

    it('denies an unverified, missing or non-admin email', async () => {
        for (const claims of [
            {
                email: ADMIN_EMAIL,
                email_verified: false,
            },
            { email: ADMIN_EMAIL },
            { email_verified: true },
            {
                email: 'stranger@gmail.com',
                email_verified: true,
            },
        ]) {
            expect(await finishWithClaims(claims)).toMatchObject({ kind: 'denied' });
        }
    });

    it('fails on a wrong nonce or an ID token not signed by Google', async () => {
        expect(await finishWithClaims({
            email: ADMIN_EMAIL,
            email_verified: true,
            nonce: 'other-nonce',
        })).toMatchObject({ kind: 'failed' });

        fakeGoogle.signWithUnknownKey();

        expect(await finishWithClaims({
            email: ADMIN_EMAIL,
            email_verified: true,
        })).toMatchObject({ kind: 'failed' });
    });

    it('reports cancelled consent and other Google errors', async () => {
        const start = await googleLogin.start(request);
        const state = String(googleParams(start).get('state'));

        expect((await googleLogin.finish(new URLSearchParams({
            state,
            error: 'access_denied',
        }), cookiesOf(start))).result).toEqual({
            kind: 'cancelled',
            request,
        });
        expect((await googleLogin.finish(new URLSearchParams({
            state,
            error: 'server_error',
        }), cookiesOf(start))).result).toMatchObject({ kind: 'failed' });
    });

    it('treats a missing, foreign, changed or expired transaction as expired', async () => {
        const start = await googleLogin.start(request);
        const other = await googleLogin.start(request);

        expect(await googleLogin.finish(callbackQuery(start), {})).toEqual({
            result: { kind: 'expired' },
            cookieName: start.cookie.name,
        });
        expect((await googleLogin.finish(callbackQuery(start), { [start.cookie.name]: other.cookie.value })).result).toEqual({ kind: 'expired' });
        expect((await googleLogin.finish(callbackQuery(start), { [start.cookie.name]: `${start.cookie.value}x` })).result).toEqual({ kind: 'expired' });
        expect(await googleLogin.finish(new URLSearchParams({ code: 'google-code' }), cookiesOf(start))).toEqual({
            result: { kind: 'expired' },
            cookieName: undefined,
        });

        currentTime += 601_000;

        expect((await googleLogin.finish(callbackQuery(start), cookiesOf(start))).result).toEqual({ kind: 'expired' });
        expect(fakeGoogle.tokenRequests).toHaveLength(0);
    });
});
