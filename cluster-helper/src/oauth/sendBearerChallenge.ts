import type { FastifyReply } from 'fastify';

import { type AccessTokenCheck, MCP_SCOPE } from './authorizationServer';

/**
 * Answers a request to an MCP endpoint without a valid access token. The challenge points
 * the client at the resource metadata, which is how ChatGPT finds the authorization server
 * and starts the OAuth flow.
 */
export function sendBearerChallenge(reply: FastifyReply, {
    check, resourceMetadataUrl,
}: {
    check: Exclude<AccessTokenCheck, { kind: 'valid' }>;
    resourceMetadataUrl: string;
}) {
    const error = check.kind === 'invalid' ? ', error="invalid_token"' : '';

    return reply
        .code(401)
        .header('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}", scope="${MCP_SCOPE}"${error}`)
        .send({ error: 'unauthorized' });
}
