import { randomBytes } from 'node:crypto';

import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { httpRateLimit } from 'senaev-utils/src/utils/http/httpRateLimit';
import { registerHttpRequestSupport } from 'senaev-utils/src/utils/http/registerHttpRequestSupport';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import type {
    AuthorizationServer, AuthorizeOutcome, AuthorizeRequest, LoginAttempt,
} from './authorizationServer';
import type { GoogleLogin, GoogleLoginResult } from './googleLogin';
import {
    renderAuthorizationError, renderAuthorizationSuccess, renderLoginPage,
} from './renderLoginPage';

// Keep the form policy restrictive; successful authorization uses a normal link.
// `form-action` also applies to the redirect after a form submit, so the Google form needs
// Google's authorization endpoint here.
const LOGIN_PAGE_CSP = [
    'default-src \'none\'',
    'style-src \'unsafe-inline\'',
    'form-action \'self\' https://chatgpt.com https://accounts.google.com',
    'frame-ancestors \'none\'',
    'base-uri \'none\'',
].join('; ');

const GOOGLE_START_PATH = '/google/start';

export const GOOGLE_CALLBACK_PATH = '/google/callback';

// Routes that answer with an HTML page, so their errors are HTML pages too.
const HTML_ROUTES = new Set([
    '/authorize',
    GOOGLE_START_PATH,
    GOOGLE_CALLBACK_PATH,
]);

// `__Host-` cookies must be Secure, have Path=/ and no Domain. Lax is sent on the
// top-level redirect back from Google.
const TRANSACTION_COOKIE_OPTIONS: CookieSerializeOptions = {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
};

function asParams(value: unknown): Record<string, unknown> {
    return isObject(value) ? value : {};
}

function sendAuthorizationError(reply: FastifyReply, status: number, message: string, continueUrl?: string) {
    return reply.code(status)
        .header('Cache-Control', 'no-store')
        .header('Content-Security-Policy', LOGIN_PAGE_CSP)
        .header('X-Frame-Options', 'DENY')
        .type('text/html')
        .send(renderAuthorizationError(message, reply.request.id, continueUrl));
}

function sendAuthorizeOutcome(reply: FastifyReply, outcome: AuthorizeOutcome) {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');

    if (outcome.kind === 'redirect') {
        const redirect = new URL(outcome.location);

        if (redirect.searchParams.has('error')) {
            return sendAuthorizationError(reply, 400, redirect.searchParams.get('error_description') ?? 'The authorization request is invalid.', outcome.location);
        }

        const nonce = randomBytes(16).toString('base64');

        return reply.code(200)
            .header('Content-Security-Policy', `${LOGIN_PAGE_CSP}; script-src 'nonce-${nonce}'`)
            .header('X-Frame-Options', 'DENY')
            .type('text/html')
            .send(renderAuthorizationSuccess(outcome.location, nonce));
    }

    if (outcome.kind === 'reject') {
        return sendAuthorizationError(reply, 400, outcome.message);
    }

    return reply
        .code(outcome.error === undefined ? 200 : 401)
        .header('Content-Security-Policy', LOGIN_PAGE_CSP)
        .header('X-Frame-Options', 'DENY')
        .type('text/html')
        .send(renderLoginPage(outcome.request, outcome.error));
}

function showLoginAgain(reply: FastifyReply, request: AuthorizeRequest, error: string) {
    return sendAuthorizeOutcome(reply, {
        kind: 'show-login',
        request,
        error,
    });
}

export type OAuthRoutesOptions = {
    authorizationServer: AuthorizationServer;
    googleLogin: GoogleLogin;
    onLoginAttempt?: (attempt: LoginAttempt) => void;
    authDomain: string;
    mcpDomain: string;
    /** The MCP endpoints. The root metadata path answers for the first one. */
    mcpPaths: readonly [string, ...string[]];
};

/**
 * The authorization server on `authDomain`, and the protected resource metadata for the
 * MCP endpoint on `mcpDomain`. Both hosts reach the same public port, so the routes are
 * bound to their host and do not answer on the other public domains.
 */
// A plugin, so that the form body parser and the rate limiter apply only to these routes.
export const oauthRoutes: FastifyPluginAsync<OAuthRoutesOptions> = async (instance, {
    authorizationServer,
    googleLogin,
    onLoginAttempt,
    authDomain,
    mcpDomain,
    mcpPaths,
}) => {
    await registerHttpRequestSupport(instance);

    const onAuthDomain = { constraints: { host: authDomain } };
    const onMcpDomain = { constraints: { host: mcpDomain } };

    // Scoped to this plugin: token errors retain their JSON protocol response.
    instance.setErrorHandler((error, request, reply) => {
        if (request.hostname !== authDomain || !HTML_ROUTES.has(request.routeOptions.url ?? '')) {
            return reply.send(error);
        }

        const status = isObject(error) && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode <= 599
            ? error.statusCode
            : 500;
        let message = 'The sign-in request could not be read. Return to the app and start the connection again.';

        if (status === 429) {
            message = 'Too many sign-in attempts. Wait a minute before trying again.';
        } else if (status >= 500) {
            message = 'Sign-in is temporarily unavailable. Please try again later.';
        }

        // Only safe identifiers: errors may include sensitive request data.
        request.log.warn({
            requestId: request.id,
            statusCode: status,
        }, 'OAuth authorization request failed');

        return sendAuthorizationError(reply, status, message);
    });

    instance.get('/.well-known/oauth-authorization-server', onAuthDomain, (_request, reply) => reply.send(authorizationServer.authorizationServerMetadata()));

    instance.get('/authorize', onAuthDomain, (request, reply) => sendAuthorizeOutcome(reply, authorizationServer.authorize(asParams(request.query))));

    instance.post('/authorize', {
        ...onAuthDomain,
        ...httpRateLimit('login'),
    }, (request, reply) => sendAuthorizeOutcome(reply, authorizationServer.login(asParams(request.body))));

    instance.get(GOOGLE_START_PATH, {
        ...onAuthDomain,
        ...httpRateLimit('google-start'),
    }, async (request, reply) => {
        // The hidden fields come from the browser, so the request is checked again here:
        // otherwise a link with another redirect_uri would send the code elsewhere.
        const outcome = authorizationServer.authorize(asParams(request.query));

        if (outcome.kind !== 'show-login') {
            return sendAuthorizeOutcome(reply, outcome);
        }

        const { authorizationUrl, cookie: transactionCookie } = await googleLogin.start(outcome.request);

        return reply
            .setCookie(transactionCookie.name, transactionCookie.value, {
                ...TRANSACTION_COOKIE_OPTIONS,
                maxAge: transactionCookie.maxAgeSeconds,
            })
            .header('Cache-Control', 'no-store')
            .header('Referrer-Policy', 'no-referrer')
            .redirect(authorizationUrl, 302);
    });

    function sendGoogleLoginResult(reply: FastifyReply, result: GoogleLoginResult) {
        switch (result.kind) {
        case 'expired':
            return sendAuthorizationError(reply, 400, 'The Google sign-in has expired or was started in another browser.');
        case 'cancelled':
            return showLoginAgain(reply, result.request, 'Google sign-in was cancelled.');
        case 'failed':
            reply.request.log.warn({
                requestId: reply.request.id,
                error: result.error instanceof Error ? result.error.message : 'unknown',
            }, 'Google sign-in failed');

            return showLoginAgain(reply, result.request, 'Google sign-in failed. Try again, or sign in with the password.');
        case 'denied':
            onLoginAttempt?.({
                method: 'google',
                result: 'denied',
                account: result.email ?? 'no verified email',
            });

            return showLoginAgain(reply, result.request, 'This Google account is not allowed.');
        case 'allowed':
            break;
        }

        onLoginAttempt?.({
            method: 'google',
            result: 'success',
            account: result.email,
        });

        return sendAuthorizeOutcome(reply, authorizationServer.completeAuthorization(result.request, {
            method: 'google',
            email: result.email,
        }));
    }

    instance.get(GOOGLE_CALLBACK_PATH, {
        ...onAuthDomain,
        ...httpRateLimit('google-callback'),
    }, async (request, reply) => {
        const query = new URL(request.url, `https://${authDomain}`).searchParams;
        const { result, cookieName } = await googleLogin.finish(query, request.cookies);

        // Each transaction is used once, whatever the result.
        if (cookieName !== undefined) {
            reply.clearCookie(cookieName, TRANSACTION_COOKIE_OPTIONS);
        }

        return sendGoogleLoginResult(reply, result);
    });

    instance.post('/token', {
        ...onAuthDomain,
        ...httpRateLimit('token'),
    }, async (request, reply) => {
        const { status, body } = await authorizationServer.token(asParams(request.body));

        return reply.code(status).header('Cache-Control', 'no-store').send(body);
    });

    // RFC 9728 puts the metadata of https://host/mcp at /.well-known/oauth-protected-resource/mcp.
    // The root path is served too, because some clients look there first.
    const serveProtectedResourceMetadata = (metadataPath: string, mcpPath: string) => {
        const metadata = authorizationServer.protectedResourceMetadata(`https://${mcpDomain}${mcpPath}`);

        instance.get(metadataPath, onMcpDomain, (_request, reply) => reply.send(metadata));
    };

    serveProtectedResourceMetadata('/.well-known/oauth-protected-resource', mcpPaths[0]);

    for (const mcpPath of mcpPaths) {
        serveProtectedResourceMetadata(`/.well-known/oauth-protected-resource${mcpPath}`, mcpPath);
    }
};
