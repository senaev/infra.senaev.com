import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import type { AuthorizationServer, AuthorizeOutcome } from './authorizationServer';
import { renderLoginPage } from './renderLoginPage';

// Redirects after a form post are checked against form-action too, so ChatGPT must be in it.
const LOGIN_PAGE_CSP = [
    'default-src \'none\'',
    'style-src \'unsafe-inline\'',
    'form-action \'self\' https://chatgpt.com',
    'frame-ancestors \'none\'',
    'base-uri \'none\'',
].join('; ');

function asParams(value: unknown): Record<string, unknown> {
    return isObject(value) ? value : {};
}

function sendAuthorizeOutcome(reply: FastifyReply, outcome: AuthorizeOutcome) {
    reply.header('Cache-Control', 'no-store');

    if (outcome.kind === 'redirect') {
        return reply.redirect(outcome.location, 302);
    }

    if (outcome.kind === 'reject') {
        return reply.code(400).type('text/plain').send(outcome.message);
    }

    return reply
        .code(outcome.error === undefined ? 200 : 401)
        .header('Content-Security-Policy', LOGIN_PAGE_CSP)
        .header('X-Frame-Options', 'DENY')
        .type('text/html')
        .send(renderLoginPage(outcome.request, outcome.error));
}

export type OAuthRoutesOptions = {
    authorizationServer: AuthorizationServer;
    authDomain: string;
    mcpDomain: string;
    mcpPath: string;
};

/**
 * The authorization server on `authDomain`, and the protected resource metadata for the
 * MCP endpoint on `mcpDomain`. Both hosts reach the same public port, so the routes are
 * bound to their host and do not answer on the other public domains.
 */
// A plugin, so that the form body parser and the rate limiter apply only to these routes.
export const oauthRoutes: FastifyPluginAsync<OAuthRoutesOptions> = async (instance, {
    authorizationServer,
    authDomain,
    mcpDomain,
    mcpPath,
}) => {
    await instance.register(formbody);
    await instance.register(rateLimit, { global: false });

    const onAuthDomain = { constraints: { host: authDomain } };
    const onMcpDomain = { constraints: { host: mcpDomain } };

    instance.get('/.well-known/oauth-authorization-server', onAuthDomain, (_request, reply) => reply.send(authorizationServer.authorizationServerMetadata()));

    instance.get('/authorize', onAuthDomain, (request, reply) => sendAuthorizeOutcome(reply, authorizationServer.authorize(asParams(request.query))));

    instance.post('/authorize', {
        ...onAuthDomain,
        // One key for all clients, not per IP: behind Traefik every request has the
        // same source address anyway. Too many attempts lock the form for a while;
        // tokens that are already issued keep working.
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '15 minutes',
                keyGenerator: () => 'login',
            },
        },
    }, (request, reply) => sendAuthorizeOutcome(reply, authorizationServer.login(asParams(request.body))));

    instance.post('/token', {
        ...onAuthDomain,
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute',
                keyGenerator: () => 'token',
            },
        },
    }, async (request, reply) => {
        const { status, body } = await authorizationServer.token(asParams(request.body));

        return reply.code(status).header('Cache-Control', 'no-store').send(body);
    });

    // RFC 9728 puts the metadata of https://host/mcp at /.well-known/oauth-protected-resource/mcp.
    // The root path is served too, because some clients look there first.
    const protectedResourceMetadataPaths = [
        '/.well-known/oauth-protected-resource',
        `/.well-known/oauth-protected-resource${mcpPath}`,
    ];

    for (const path of protectedResourceMetadataPaths) {
        instance.get(path, onMcpDomain, (_request, reply) => reply.send(authorizationServer.protectedResourceMetadata()));
    }
};
