import { createHash } from 'node:crypto';

import Fastify, { FastifyInstance } from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, Mock, vi,
} from 'vitest';

import {
    CODE_MCP_PATH,
    GRAFANA_MCP_PATH,
    MCP_PATHS,
    mcpEndpoints,
    McpEndpointsOptions,
    mcpResource,
    mcpResourceMetadataUrl,
    mcpResources,
    OBSIDIAN_MCP_PATH,
} from './mcpEndpoints';
import { AuthorizationServer, createAuthorizationServer } from './oauth/authorizationServer';
import { createGoogleLogin } from './oauth/googleLogin';

const AUTH_DOMAIN = 'auth.example.com';
const MCP_DOMAIN = 'mcp.example.com';
const GRAFANA_UPSTREAM_URL = 'http://mcp-grafana.telemetry.svc.cluster.local:8000/mcp';
const CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CODE_VERIFIER = 'v'.repeat(43);
const CODE_CHALLENGE = createHash('sha256').update(CODE_VERIFIER).digest('base64url');

let server: FastifyInstance;
let authorizationServer: AuthorizationServer;
let replyToObsidianMessage: Mock<McpEndpointsOptions['replyToObsidianMessage']>;
let replyToCodeMessage: Mock<McpEndpointsOptions['replyToCodeMessage']>;
let fetchGrafana: Mock<typeof fetch>;

const GOOGLE_EMAIL = 'admin@gmail.com';

describe('MCP resources', () => {
    it('serves the Obsidian, the code and the Grafana endpoints, Obsidian first as the default resource', () => {
        expect(MCP_PATHS).toEqual([
            OBSIDIAN_MCP_PATH,
            CODE_MCP_PATH,
            GRAFANA_MCP_PATH,
        ]);
    });
});

describe('mcpEndpoints HTTP wiring', () => {
    beforeEach(async () => {
        authorizationServer = createAuthorizationServer({
            issuer: `https://${AUTH_DOMAIN}`,
            resources: mcpResources(MCP_DOMAIN),
            signingSecret: 'signing-secret',
            googleAdminEmails: new Set([GOOGLE_EMAIL]),
        });
        replyToObsidianMessage = vi.fn<McpEndpointsOptions['replyToObsidianMessage']>((_message, reply) => Promise.resolve(reply.code(200).send({ from: 'obsidian' })));
        replyToCodeMessage = vi.fn<McpEndpointsOptions['replyToCodeMessage']>((_message, reply) => Promise.resolve(reply.code(200).send({ from: 'code' })));
        fetchGrafana = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{"from":"grafana"}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })));

        server = Fastify();
        // Same catch-all as the public server: routes bound to another host must fall through to it.
        server.get('/*', (_request, reply) => reply.code(401).send('Unauthorized'));
        await server.register(mcpEndpoints, {
            authorizationServer,
            googleLogin: createGoogleLogin({
                clientId: 'google-client-id',
                clientSecret: 'google-client-secret',
                redirectUri: `https://${AUTH_DOMAIN}/google/callback`,
                adminEmails: new Set(),
                transactionSecret: 'signing-secret',
            }),
            authDomain: AUTH_DOMAIN,
            mcpDomain: MCP_DOMAIN,
            replyToObsidianMessage,
            replyToCodeMessage,
            grafanaUpstreamUrl: GRAFANA_UPSTREAM_URL,
            fetch: fetchGrafana,
        });
    });

    afterEach(async () => {
        await server.close();
    });

    async function getAccessToken(path: string): Promise<string> {
        const resource = mcpResource(MCP_DOMAIN, path);
        const checked = authorizationServer.authorize({
            response_type: 'code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            state: 'state',
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'S256',
            resource,
        });

        if (checked.kind !== 'show-login') {
            throw new Error(`Expected show-login, got ${checked.kind}`);
        }

        // What the Google callback does after Google confirmed an allowed email.
        const outcome = authorizationServer.completeAuthorization(checked.request, {
            method: 'google',
            email: GOOGLE_EMAIL,
        });

        if (outcome.kind !== 'redirect') {
            throw new Error(`Expected a redirect, got ${outcome.kind}`);
        }

        const { status, body } = await authorizationServer.token({
            grant_type: 'authorization_code',
            code: new URL(outcome.location).searchParams.get('code') ?? '',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_verifier: CODE_VERIFIER,
            resource,
        });

        expect(status).toBe(200);

        return (body as { access_token: string }).access_token;
    }

    function postMcp(path: string, accessToken?: string) {
        return server.inject({
            method: 'POST',
            url: path,
            body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
            headers: {
                host: MCP_DOMAIN,
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                ...(accessToken !== undefined && { authorization: `Bearer ${accessToken}` }),
            },
        });
    }

    describe('mcpEndpoints', () => {
        describe.each(MCP_PATHS)('%s', (path) => {
            it('answers 401 with its own resource metadata URL without a token', async () => {
                const response = await postMcp(path);

                expect(response.statusCode).toBe(401);
                expect(response.headers['www-authenticate']).toContain(`resource_metadata="${mcpResourceMetadataUrl(MCP_DOMAIN, path)}"`);
            });

            it('serves its resource metadata', async () => {
                const response = await server.inject({
                    url: new URL(mcpResourceMetadataUrl(MCP_DOMAIN, path)).pathname,
                    headers: { host: MCP_DOMAIN },
                });

                expect(response.statusCode).toBe(200);
                expect(response.json()).toMatchObject({
                    resource: mcpResource(MCP_DOMAIN, path),
                    authorization_servers: [`https://${AUTH_DOMAIN}`],
                });
            });

            it('accepts a token for its resource and rejects a token for another one', async () => {
                const otherPath = MCP_PATHS.find((candidate) => candidate !== path) ?? '';

                expect((await postMcp(path, await getAccessToken(path))).statusCode).toBe(200);

                const rejected = await postMcp(path, await getAccessToken(otherPath));

                expect(rejected.statusCode).toBe(401);
                expect(rejected.headers['www-authenticate']).toContain('error="invalid_token"');
            });
        });

        it('sends a valid /obsidian request to the Obsidian MCP server only', async () => {
            const response = await postMcp(OBSIDIAN_MCP_PATH, await getAccessToken(OBSIDIAN_MCP_PATH));

            expect(response.json()).toEqual({ from: 'obsidian' });
            expect(replyToObsidianMessage).toHaveBeenCalledTimes(1);
            expect(replyToCodeMessage).not.toHaveBeenCalled();
            expect(fetchGrafana).not.toHaveBeenCalled();
        });

        it('sends a valid /code-tools request to the code MCP server only', async () => {
            const response = await postMcp(CODE_MCP_PATH, await getAccessToken(CODE_MCP_PATH));

            expect(response.json()).toEqual({ from: 'code' });
            expect(replyToCodeMessage).toHaveBeenCalledTimes(1);
            expect(replyToObsidianMessage).not.toHaveBeenCalled();
            expect(fetchGrafana).not.toHaveBeenCalled();
        });

        it('sends a valid /grafana request to mcp-grafana', async () => {
            const response = await postMcp(GRAFANA_MCP_PATH, await getAccessToken(GRAFANA_MCP_PATH));

            expect(response.json()).toEqual({ from: 'grafana' });
            expect(fetchGrafana).toHaveBeenCalledWith(GRAFANA_UPSTREAM_URL, expect.anything());
            expect(replyToObsidianMessage).not.toHaveBeenCalled();
            expect(replyToCodeMessage).not.toHaveBeenCalled();
        });

        it('no longer serves the combined /chat-gpt endpoint', async () => {
            const response = await postMcp('/chat-gpt', await getAccessToken(OBSIDIAN_MCP_PATH));

            expect(response.statusCode).toBe(404);
        });

        it.each([
            OBSIDIAN_MCP_PATH,
            CODE_MCP_PATH,
        ])('answers GET %s with 405, as it has no SSE stream', async (path) => {
            const response = await server.inject({
                url: path,
                headers: { host: MCP_DOMAIN },
            });

            expect(response.statusCode).toBe(405);
        });
    });
});
