import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { grafanaMcpProxy } from './grafanaMcp/grafanaMcpProxy';
import type { AuthorizationServer, LoginAttempt } from './oauth/authorizationServer';
import type { GoogleLogin } from './oauth/googleLogin';
import { oauthRoutes } from './oauth/registerOAuthRoutes';
import { sendBearerChallenge } from './oauth/sendBearerChallenge';

export const CHAT_GPT_MCP_PATH = '/chat-gpt';
export const GRAFANA_MCP_PATH = '/grafana';

// Each endpoint is its own OAuth resource, and a token is valid only for the one it was issued
// for. /chat-gpt is first: it is the default for clients that send no `resource`.
export const MCP_PATHS = [
    CHAT_GPT_MCP_PATH,
    GRAFANA_MCP_PATH,
] as const;

export function mcpResource(mcpDomain: string, path: string): string {
    return `https://${mcpDomain}${path}`;
}

export function mcpResourceMetadataUrl(mcpDomain: string, path: string): string {
    return `https://${mcpDomain}/.well-known/oauth-protected-resource${path}`;
}

export function mcpResources(mcpDomain: string): readonly [string, ...string[]] {
    const [
        first,
        ...rest
    ] = MCP_PATHS;

    return [
        mcpResource(mcpDomain, first),
        ...rest.map((path) => mcpResource(mcpDomain, path)),
    ];
}

export type McpEndpointsOptions = {
    /** Must be created with `mcpResources(mcpDomain)`. */
    authorizationServer: AuthorizationServer;
    googleLogin: GoogleLogin;
    onLoginAttempt?: (attempt: LoginAttempt) => void;
    authDomain: string;
    mcpDomain: string;
    replyToChatGptMessage: (message: unknown, reply: FastifyReply) => Promise<unknown>;
    grafanaUpstreamUrl: string;
    grafanaUpstreamToken: string;
    fetch?: typeof fetch;
};

/**
 * The OAuth-protected MCP endpoints on `mcpDomain`, and the authorization server routes for them.
 */
export const mcpEndpoints: FastifyPluginAsync<McpEndpointsOptions> = async (instance, {
    authorizationServer,
    googleLogin,
    onLoginAttempt,
    authDomain,
    mcpDomain,
    replyToChatGptMessage,
    grafanaUpstreamUrl,
    grafanaUpstreamToken,
    fetch,
}) => {
    await instance.register(oauthRoutes, {
        authorizationServer,
        googleLogin,
        ...(onLoginAttempt !== undefined && { onLoginAttempt }),
        authDomain,
        mcpDomain,
        mcpPaths: MCP_PATHS,
    });

    const onMcpDomain = { constraints: { host: mcpDomain } };

    instance.post<{ Body: unknown }>(CHAT_GPT_MCP_PATH, onMcpDomain, async (request, reply) => {
        const check = await authorizationServer.checkAccessToken(request.headers.authorization, mcpResource(mcpDomain, CHAT_GPT_MCP_PATH));

        if (check.kind !== 'valid') {
            return sendBearerChallenge(reply, {
                check,
                resourceMetadataUrl: mcpResourceMetadataUrl(mcpDomain, CHAT_GPT_MCP_PATH),
            });
        }

        return replyToChatGptMessage(request.body, reply);
    });

    // No server-initiated SSE stream: the transport spec says to answer GET with 405.
    instance.get(CHAT_GPT_MCP_PATH, onMcpDomain, (_request, reply) => reply.code(405).header('Allow', 'POST').send());

    await instance.register(grafanaMcpProxy, {
        path: GRAFANA_MCP_PATH,
        mcpDomain,
        resourceMetadataUrl: mcpResourceMetadataUrl(mcpDomain, GRAFANA_MCP_PATH),
        checkAccessToken: (authorizationHeader) => authorizationServer.checkAccessToken(authorizationHeader, mcpResource(mcpDomain, GRAFANA_MCP_PATH)),
        upstreamUrl: grafanaUpstreamUrl,
        upstreamToken: grafanaUpstreamToken,
        ...(fetch !== undefined && { fetch }),
    });
};
