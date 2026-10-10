import { isObject } from 'senaev-utils/src/types/Object/Object';
import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';

import type { ToolReply } from './toolFamilies';

/**
 * Runs a tool on a tool server (obsidian-sync, code-tools) with `POST <url>` and the
 * internal token. A reply with `status: "error"` is a normal tool error for ChatGPT; only a
 * transport failure, a timeout or a reply that is not a JSON object throws.
 */
export async function callToolServer({
    url, token, args, timeoutMs, serverName,
}: { url: string; token: string; args: unknown; timeoutMs: number; serverName: string }): Promise<ToolReply> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            authorization: createBearerAuthorizationHeader(token),
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(timeoutMs),
    });
    const body: unknown = await response.json();

    if (!isObject(body) || Array.isArray(body)) {
        throw new Error(`${serverName} answered HTTP ${response.status} with a body that is not a JSON object`);
    }

    return {
        isError: !response.ok || body.status !== 'ok',
        body,
    };
}
