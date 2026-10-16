import { createHmac } from 'node:crypto';

import { EncryptJWT, jwtDecrypt } from 'jose';
import * as oidc from 'openid-client';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import type { AuthorizeRequest } from './authorizationServer';

// Google sign-in as a second way to authorize the ChatGPT request: a server-side OpenID
// Connect authorization-code flow with PKCE. Google tokens are used only to learn the
// verified email and are never stored or used as MCP tokens.
// https://developers.google.com/identity/openid-connect/openid-connect

// Static, so that startup does not depend on the discovery document being reachable.
// https://accounts.google.com/.well-known/openid-configuration
const GOOGLE_SERVER_METADATA: oidc.ServerMetadata = {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
};

export const GOOGLE_LOGIN_SCOPE = 'openid email';

// Only Gmail addresses: Google owns them, so `email_verified` is reliable. A Google account
// made with another provider's email is checked by Google only once, at creation.
const GMAIL_ADDRESS = /^[a-z0-9.]+@gmail\.com$/;

// `randomState()` is 32 random bytes in base64url. The state is part of the cookie name.
const STATE_FORMAT = /^[\w-]{43}$/;

const TRANSACTION_TTL_SECONDS = 10 * 60;
const TRANSACTION_COOKIE_PREFIX = '__Host-google-login-';
const TRANSACTION_ENCRYPTION = {
    alg: 'dir',
    enc: 'A256GCM',
} as const;

export type GoogleLoginConfig = {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    adminEmails: ReadonlySet<string>;
    /** The key that encrypts the login transaction cookie is derived from it. */
    transactionSecret: string;
    fetch?: oidc.CustomFetch;
    now?: () => number;
};

/** The ChatGPT request and the Google checks of one login, kept encrypted in the browser. */
type Transaction = {
    request: AuthorizeRequest;
    state: string;
    nonce: string;
    codeVerifier: string;
};

export type TransactionCookie = {
    name: string;
    value: string;
    maxAgeSeconds: number;
};

export type GoogleLoginStart = {
    authorizationUrl: string;
    cookie: TransactionCookie;
};

export type GoogleLoginResult =
    | { kind: 'allowed'; request: AuthorizeRequest; email: string }
    | { kind: 'denied'; request: AuthorizeRequest; email: string | undefined }
    | { kind: 'cancelled'; request: AuthorizeRequest }
    | { kind: 'failed'; request: AuthorizeRequest; error: unknown }
    | { kind: 'expired' };

export type GoogleLoginFinish = {
    result: GoogleLoginResult;
    /** The transaction cookie that the callback must delete, if the state names one. */
    cookieName: string | undefined;
};

/** Parses a comma-separated list of Gmail addresses; throws on an invalid entry. */
export function parseGoogleAdminEmails(value: string): ReadonlySet<string> {
    const emails = value.split(',').map((entry) => entry.trim().toLowerCase());

    emails.forEach((email, index) => {
        if (!GMAIL_ADDRESS.test(email)) {
            throw new Error(`GOOGLE_OAUTH_ADMIN_EMAILS: entry ${index + 1} is not a Gmail address`);
        }
    });

    return new Set(emails);
}

// The payload is authenticated, so it is the object that `start` encrypted; this only
// restores its type.
function readTransaction(payload: unknown): Transaction | null {
    if (!isObject(payload) || !isObject(payload.request)) {
        return null;
    }

    const {
        request, state, nonce, codeVerifier,
    } = payload;
    const {
        clientId, redirectUri, codeChallenge, resource,
    } = request;
    const requestState = request.state;

    if (
        typeof state !== 'string' || typeof nonce !== 'string' || typeof codeVerifier !== 'string' || typeof clientId !== 'string' || typeof redirectUri !== 'string' || typeof codeChallenge !== 'string' || typeof resource !== 'string'
    ) {
        return null;
    }

    return {
        request: {
            clientId,
            redirectUri,
            state: typeof requestState === 'string' ? requestState : undefined,
            codeChallenge,
            resource,
        },
        state,
        nonce,
        codeVerifier,
    };
}

export function createGoogleLogin(config: GoogleLoginConfig) {
    const {
        redirectUri, adminEmails,
    } = config;
    const now = config.now ?? Date.now;

    const transactionKey = createHmac('sha256', config.transactionSecret).update('google-login-transaction').digest();

    const oidcConfig = new oidc.Configuration(GOOGLE_SERVER_METADATA, config.clientId, config.clientSecret);

    if (config.fetch !== undefined) {
        oidcConfig[oidc.customFetch] = config.fetch;
    }

    // Also verify the ID token signature with Google's keys, not only its claims.
    oidc.enableNonRepudiationChecks(oidcConfig);

    function encryptTransaction(transaction: Transaction): Promise<string> {
        const issuedAt = Math.floor(now() / 1000);

        return new EncryptJWT({ ...transaction })
            .setProtectedHeader(TRANSACTION_ENCRYPTION)
            .setIssuedAt(issuedAt)
            .setExpirationTime(issuedAt + TRANSACTION_TTL_SECONDS)
            .encrypt(transactionKey);
    }

    async function decryptTransaction(value: string | undefined): Promise<Transaction | null> {
        if (value === undefined) {
            return null;
        }

        try {
            const { payload } = await jwtDecrypt(value, transactionKey, {
                keyManagementAlgorithms: [TRANSACTION_ENCRYPTION.alg],
                contentEncryptionAlgorithms: [TRANSACTION_ENCRYPTION.enc],
                requiredClaims: ['exp'],
                currentDate: new Date(now()),
            });

            return readTransaction(payload);
        } catch {
            return null;
        }
    }

    async function readClaims(callbackUrl: URL, transaction: Transaction) {
        const tokens = await oidc.authorizationCodeGrant(oidcConfig, callbackUrl, {
            pkceCodeVerifier: transaction.codeVerifier,
            expectedState: transaction.state,
            expectedNonce: transaction.nonce,
            idTokenExpected: true,
        });

        return tokens.claims();
    }

    function isAllowedEmail(email: string | undefined, isVerified: boolean): email is string {
        return isVerified && email !== undefined && GMAIL_ADDRESS.test(email) && adminEmails.has(email);
    }

    return {
        /** Takes a request already checked by `authorize`, so it never trusts the browser. */
        async start(request: AuthorizeRequest): Promise<GoogleLoginStart> {
            const transaction: Transaction = {
                request,
                state: oidc.randomState(),
                nonce: oidc.randomNonce(),
                codeVerifier: oidc.randomPKCECodeVerifier(),
            };

            const authorizationUrl = oidc.buildAuthorizationUrl(oidcConfig, {
                redirect_uri: redirectUri,
                scope: GOOGLE_LOGIN_SCOPE,
                state: transaction.state,
                nonce: transaction.nonce,
                code_challenge: await oidc.calculatePKCECodeChallenge(transaction.codeVerifier),
                code_challenge_method: 'S256',
                prompt: 'select_account',
            });

            return {
                authorizationUrl: authorizationUrl.toString(),
                // One cookie per state, so that logins in two tabs do not overwrite each other.
                cookie: {
                    name: `${TRANSACTION_COOKIE_PREFIX}${transaction.state}`,
                    value: await encryptTransaction(transaction),
                    maxAgeSeconds: TRANSACTION_TTL_SECONDS,
                },
            };
        },

        /** Handles the redirect back from Google, with its query and the request cookies. */
        async finish(query: URLSearchParams, cookies: Record<string, string | undefined>): Promise<GoogleLoginFinish> {
            const state = query.get('state');

            if (state === null || !STATE_FORMAT.test(state)) {
                return {
                    result: { kind: 'expired' },
                    cookieName: undefined,
                };
            }

            const cookieName = `${TRANSACTION_COOKIE_PREFIX}${state}`;
            const transaction = await decryptTransaction(cookies[cookieName]);
            const finish = (result: GoogleLoginResult): GoogleLoginFinish => {
                return {
                    result,
                    cookieName,
                };
            };

            if (transaction === null || transaction.state !== state) {
                return finish({ kind: 'expired' });
            }

            const { request } = transaction;

            if (query.has('error')) {
                return finish(query.get('error') === 'access_denied'
                    ? {
                        kind: 'cancelled',
                        request,
                    }
                    : {
                        kind: 'failed',
                        request,
                        error: new Error(`Google returned error=${query.get('error')}`),
                    });
            }

            const callbackUrl = new URL(redirectUri);

            callbackUrl.search = query.toString();

            let claims: Awaited<ReturnType<typeof readClaims>>;

            try {
                claims = await readClaims(callbackUrl, transaction);
            } catch (error) {
                return finish({
                    kind: 'failed',
                    request,
                    error,
                });
            }

            const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : undefined;

            return finish(isAllowedEmail(email, claims?.email_verified === true)
                ? {
                    kind: 'allowed',
                    request,
                    email,
                }
                : {
                    kind: 'denied',
                    request,
                    email,
                });
        },
    };
}

export type GoogleLogin = ReturnType<typeof createGoogleLogin>;
