import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it,
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

beforeEach(async () => {
    server = Fastify();
    // Same catch-all as the public server: routes bound to another host must fall through to it.
    server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));
    await server.register(oauthRoutes, {
        authorizationServer: createAuthorizationServer({
            issuer: `https://${AUTH_DOMAIN}`,
            resource: `https://${MCP_DOMAIN}/mcp`,
            username: 'andrei',
            password: 'secret-password',
            signingSecret: 'signing-secret',
        }),
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
