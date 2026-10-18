import {
    createHmac, randomBytes, timingSafeEqual,
} from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';
import { parseBearerToken } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import { sha256 } from 'senaev-utils/src/utils/crypto/sha256/sha256';

// A minimal OAuth 2.1 authorization server for one user, shaped by what ChatGPT needs
// from an MCP server: authorization code + PKCE S256, CIMD client ids, RFC 9207 `iss`
// in every authorization response, and RFC 8707 `resource` copied into the token `aud`.
// https://developers.openai.com/apps-sdk/build/auth
// https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization

export const MCP_SCOPE = 'mcp';

const AUTHORIZATION_CODE_TTL_MS = 60_000;

type TokenKind = {
    type: string;
    ttlSeconds: number;
};

// The JWT `typ` header tells the two token kinds apart, so a refresh token is never
// accepted as an access token. `at+jwt` is the RFC 9068 type for access tokens.
const ACCESS_TOKEN: TokenKind = {
    type: 'at+jwt',
    ttlSeconds: 60 * 60,
};
const REFRESH_TOKEN: TokenKind = {
    type: 'refresh+jwt',
    ttlSeconds: 90 * 24 * 60 * 60,
};
const SIGNING_ALGORITHM = 'HS256';

// ChatGPT identifies itself with a Client ID Metadata Document URL, so there is no client
// registration and no client storage. The stable pair is used when the server returns
// `iss`; the callback-specific pair is the fallback for connectors created otherwise.
const CHATGPT_STABLE_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const CHATGPT_STABLE_REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CHATGPT_CALLBACK_CLIENT_ID = /^https:\/\/chatgpt\.com\/oauth\/([\w-]+)\/client\.json$/;

const PKCE_CODE_VERIFIER = /^[\w.~-]{43,128}$/;

export type LoginIdentity =
    | { method: 'password' }
    | { method: 'google'; email: string };

export type LoginAttempt = {
    method: LoginIdentity['method'];
    result: 'success' | 'denied';
    /** The Google email, or the username given in the password form. */
    account: string;
};

export type AuthorizationServerConfig = {
    issuer: string;
    /** The protected resources. The first one is the default when a client sends no `resource`. */
    resources: readonly [string, ...string[]];
    username: string;
    password: string;
    signingSecret: string;
    /** Normalized Gmail addresses; a Google-origin refresh token renews only while its email is here. */
    googleAdminEmails: ReadonlySet<string>;
    onLoginAttempt?: (attempt: LoginAttempt) => void;
    now?: () => number;
};

export type AuthorizeRequest = {
    clientId: string;
    redirectUri: string;
    state: string | undefined;
    codeChallenge: string;
    resource: string;
};

export type AuthorizeOutcome =
    | { kind: 'show-login'; request: AuthorizeRequest; error?: string }
    | { kind: 'redirect'; location: string }
    | { kind: 'reject'; message: string };

export type TokenResponse = {
    status: number;
    body: Record<string, unknown>;
};

export type AccessTokenCheck =
    | { kind: 'valid'; subject: string }
    | { kind: 'missing' }
    | { kind: 'invalid' };

type Params = Record<string, unknown>;

type IssuedCode = {
    request: AuthorizeRequest;
    identity: LoginIdentity;
    expiresAt: number;
};

// Signed into Google-origin tokens so that refresh can check the allowlist. The email is
// kept as a keyed hash: ChatGPT stores the tokens and can read their payload. Tokens
// without `idp` come from password login, or were issued before Google login existed.
type TokenProvenance =
    | { idp: 'password' }
    | { idp: 'google'; emailHash: string };

// What a token is issued for. A refresh keeps all of it, so it cannot switch resources.
type TokenGrant = {
    clientId: string;
    provenance: TokenProvenance;
    resource: string;
};

function readString(params: Params, name: string): string | undefined {
    const value = params[name];

    return typeof value === 'string' && value !== '' ? value : undefined;
}

function isAllowedClient(clientId: string, redirectUri: string): boolean {
    if (clientId === CHATGPT_STABLE_CLIENT_ID) {
        return redirectUri === CHATGPT_STABLE_REDIRECT_URI;
    }

    const callbackId = CHATGPT_CALLBACK_CLIENT_ID.exec(clientId)?.[1];

    return callbackId !== undefined && redirectUri === `https://chatgpt.com/connector/oauth/${callbackId}`;
}

export function createAuthorizationServer(config: AuthorizationServerConfig) {
    const {
        issuer, resources, username, password,
    } = config;
    const [defaultResource] = resources;
    const now = config.now ?? Date.now;

    function isKnownResource(value: unknown): value is string {
        return typeof value === 'string' && resources.includes(value);
    }

    // The key also depends on the password, so changing the password in Vault revokes
    // every token at once. That is the only revocation there is: tokens are not stored.
    const signingKey = createHmac('sha256', config.signingSecret).update(password).digest();

    function hashEmail(email: string): string {
        return createHmac('sha256', signingKey).update(`google-email:${email}`).digest('base64url');
    }

    const googleAdminEmailHashes = new Set([...config.googleAdminEmails].map(hashEmail));

    const issuedCodes = new Map<string, IssuedCode>();

    function redirectTo(redirectUri: string, params: Record<string, string | undefined>): AuthorizeOutcome {
        const url = new URL(redirectUri);

        const query: Record<string, string | undefined> = {
            ...params,
            iss: issuer,
        };

        for (const name of Object.keys(query)) {
            const value = query[name];

            if (value !== undefined) {
                url.searchParams.set(name, value);
            }
        }

        return {
            kind: 'redirect',
            location: url.toString(),
        };
    }

    function parseAuthorizeRequest(params: Params): AuthorizeOutcome {
        const clientId = readString(params, 'client_id');
        const redirectUri = readString(params, 'redirect_uri');

        // Until the client and its redirect URI are known to be ChatGPT's, an error must
        // not be sent to the redirect URI: that would make this an open redirector.
        if (clientId === undefined || redirectUri === undefined || !isAllowedClient(clientId, redirectUri)) {
            return {
                kind: 'reject',
                message: 'Unknown client or redirect URI',
            };
        }

        const state = readString(params, 'state');
        const fail = (error: string, description: string) => redirectTo(redirectUri, {
            error,
            error_description: description,
            state,
        });

        if (readString(params, 'response_type') !== 'code') {
            return fail('unsupported_response_type', 'Only response_type=code is supported');
        }

        const codeChallenge = readString(params, 'code_challenge');

        if (codeChallenge === undefined || readString(params, 'code_challenge_method') !== 'S256') {
            return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
        }

        const resource = readString(params, 'resource') ?? defaultResource;

        if (!isKnownResource(resource)) {
            return fail('invalid_target', `The resource must be one of: ${resources.join(', ')}`);
        }

        return {
            kind: 'show-login',
            request: {
                clientId,
                redirectUri,
                state,
                codeChallenge,
                resource,
            },
        };
    }

    function areCredentialsValid(givenUsername: string, givenPassword: string): boolean {
        // Compare digests so that both comparisons take constant time whatever the lengths,
        // and evaluate both so the time does not show which one was wrong.
        const isUsernameValid = timingSafeEqual(sha256(givenUsername), sha256(username));
        const isPasswordValid = timingSafeEqual(sha256(givenPassword), sha256(password));

        return isUsernameValid && isPasswordValid;
    }

    function issueAuthorizationCode(request: AuthorizeRequest, identity: LoginIdentity): string {
        const currentTime = now();

        for (const code of issuedCodes.keys()) {
            if ((issuedCodes.get(code)?.expiresAt ?? 0) <= currentTime) {
                issuedCodes.delete(code);
            }
        }

        const code = randomBytes(32).toString('base64url');

        issuedCodes.set(code, {
            request,
            identity,
            expiresAt: currentTime + AUTHORIZATION_CODE_TTL_MS,
        });

        return code;
    }

    function completeAuthorization(request: AuthorizeRequest, identity: LoginIdentity): AuthorizeOutcome {
        return redirectTo(request.redirectUri, {
            code: issueAuthorizationCode(request, identity),
            state: request.state,
        });
    }

    function provenanceOf(identity: LoginIdentity): TokenProvenance {
        return identity.method === 'google'
            ? {
                idp: 'google',
                emailHash: hashEmail(identity.email),
            }
            : { idp: 'password' };
    }

    function readProvenance(payload: Record<string, unknown>): TokenProvenance | null {
        if (payload.idp === undefined) {
            return { idp: 'password' };
        }

        return payload.idp === 'google' && typeof payload.email_hash === 'string'
            ? {
                idp: 'google',
                emailHash: payload.email_hash,
            }
            : null;
    }

    function tokenError(error: string, description: string): TokenResponse {
        return {
            status: 400,
            body: {
                error,
                error_description: description,
            },
        };
    }

    function signToken({
        type, ttlSeconds,
    }: TokenKind, {
        clientId, provenance, resource,
    }: TokenGrant, issuedAt: number): Promise<string> {
        return new SignJWT({
            client_id: clientId,
            scope: MCP_SCOPE,
            ...(provenance.idp === 'google' && {
                idp: provenance.idp,
                email_hash: provenance.emailHash,
            }),
        })
            .setProtectedHeader({
                alg: SIGNING_ALGORITHM,
                typ: type,
            })
            .setIssuer(issuer)
            .setAudience(resource)
            .setSubject(username)
            .setIssuedAt(issuedAt)
            .setExpirationTime(issuedAt + ttlSeconds)
            .setJti(randomBytes(16).toString('base64url'))
            .sign(signingKey);
    }

    async function issueTokens(grant: TokenGrant): Promise<TokenResponse> {
        const issuedAt = Math.floor(now() / 1000);

        return {
            status: 200,
            body: {
                access_token: await signToken(ACCESS_TOKEN, grant, issuedAt),
                token_type: 'Bearer',
                expires_in: ACCESS_TOKEN.ttlSeconds,
                refresh_token: await signToken(REFRESH_TOKEN, grant, issuedAt),
                scope: MCP_SCOPE,
            },
        };
    }

    async function verifyToken(token: string, type: string): Promise<TokenGrant | null> {
        try {
            const { payload } = await jwtVerify(token, signingKey, {
                algorithms: [SIGNING_ALGORITHM],
                typ: type,
                issuer,
                subject: username,
                requiredClaims: ['exp'],
                currentDate: new Date(now()),
            });

            const provenance = readProvenance(payload);

            return typeof payload.client_id === 'string' && provenance !== null && isKnownResource(payload.aud)
                ? {
                    clientId: payload.client_id,
                    provenance,
                    resource: payload.aud,
                }
                : null;
        } catch {
            return null;
        }
    }

    function isPkceVerifierValid(codeVerifier: string | undefined, codeChallenge: string): boolean {
        return codeVerifier !== undefined && PKCE_CODE_VERIFIER.test(codeVerifier) && sha256(codeVerifier).toString('base64url') === codeChallenge;
    }

    function exchangeAuthorizationCode(params: Params): Promise<TokenResponse> | TokenResponse {
        const code = readString(params, 'code');
        const issued = code === undefined ? undefined : issuedCodes.get(code);

        if (code !== undefined) {
            issuedCodes.delete(code);
        }

        if (issued === undefined || issued.expiresAt <= now()) {
            return tokenError('invalid_grant', 'Unknown or expired authorization code');
        }

        const { request, identity } = issued;
        const isSameClient = readString(params, 'client_id') === request.clientId;
        const isSameRedirectUri = readString(params, 'redirect_uri') === request.redirectUri;
        const isSameResource = (readString(params, 'resource') ?? request.resource) === request.resource;

        if (!isSameClient || !isSameRedirectUri || !isSameResource) {
            return tokenError('invalid_grant', 'client_id, redirect_uri or resource does not match the authorization request');
        }

        if (!isPkceVerifierValid(readString(params, 'code_verifier'), request.codeChallenge)) {
            return tokenError('invalid_grant', 'PKCE verification failed');
        }

        return issueTokens({
            clientId: request.clientId,
            provenance: provenanceOf(identity),
            resource: request.resource,
        });
    }

    async function exchangeRefreshToken(params: Params): Promise<TokenResponse> {
        const refreshToken = readString(params, 'refresh_token');
        const verified = refreshToken === undefined ? null : await verifyToken(refreshToken, REFRESH_TOKEN.type);
        const clientId = readString(params, 'client_id');

        if (verified === null || (clientId !== undefined && clientId !== verified.clientId)) {
            return tokenError('invalid_grant', 'Invalid or expired refresh token');
        }

        const { provenance } = verified;

        if (provenance.idp === 'google' && !googleAdminEmailHashes.has(provenance.emailHash)) {
            return tokenError('invalid_grant', 'The Google account of this refresh token is no longer allowed');
        }

        return issueTokens(verified);
    }

    return {
        /** RFC 8414, served at /.well-known/oauth-authorization-server on the issuer. */
        authorizationServerMetadata() {
            return {
                issuer,
                authorization_endpoint: `${issuer}/authorize`,
                token_endpoint: `${issuer}/token`,
                response_types_supported: ['code'],
                grant_types_supported: [
                    'authorization_code',
                    'refresh_token',
                ],
                code_challenge_methods_supported: ['S256'],
                token_endpoint_auth_methods_supported: ['none'],
                scopes_supported: [MCP_SCOPE],
                client_id_metadata_document_supported: true,
                authorization_response_iss_parameter_supported: true,
            };
        },

        /** RFC 9728, served at /.well-known/oauth-protected-resource<path> on the MCP host. */
        protectedResourceMetadata(resource: string) {
            return {
                resource,
                authorization_servers: [issuer],
                scopes_supported: [MCP_SCOPE],
                bearer_methods_supported: ['header'],
            };
        },

        /** GET /authorize: checks the request and asks for the login form. */
        authorize(params: Params): AuthorizeOutcome {
            return parseAuthorizeRequest(params);
        },

        /** POST /authorize: the login form, which carries the request as hidden fields. */
        login(params: Params): AuthorizeOutcome {
            const outcome = parseAuthorizeRequest(params);

            if (outcome.kind !== 'show-login') {
                return outcome;
            }

            const givenUsername = readString(params, 'username') ?? '';
            const isValid = areCredentialsValid(givenUsername, readString(params, 'password') ?? '');

            config.onLoginAttempt?.({
                method: 'password',
                result: isValid ? 'success' : 'denied',
                account: givenUsername,
            });

            if (!isValid) {
                return {
                    ...outcome,
                    error: 'Incorrect username or password.',
                };
            }

            return completeAuthorization(outcome.request, { method: 'password' });
        },

        /**
         * Issues the authorization code for a request that a login method other than the
         * password form has already checked with `authorize` and authenticated.
         */
        completeAuthorization,

        /** POST /token */
        async token(params: Params): Promise<TokenResponse> {
            switch (readString(params, 'grant_type')) {
            case 'authorization_code':
                return await exchangeAuthorizationCode(params);
            case 'refresh_token':
                return await exchangeRefreshToken(params);
            default:
                return tokenError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
            }
        },

        /** Checks an `Authorization` header on a request to one of the protected resources. */
        async checkAccessToken(authorizationHeader: string | undefined, resource: string): Promise<AccessTokenCheck> {
            const token = parseBearerToken(authorizationHeader);

            if (token === undefined) {
                return { kind: 'missing' };
            }

            const verified = await verifyToken(token, ACCESS_TOKEN.type);

            return verified?.resource !== resource
                ? { kind: 'invalid' }
                : {
                    kind: 'valid',
                    subject: username,
                };
        },
    };
}

export type AuthorizationServer = ReturnType<typeof createAuthorizationServer>;
