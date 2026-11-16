import { isObject } from 'senaev-utils/src/types/Object/Object';
import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';

import type { ToolReply } from './toolFamilies';

/**
 * Runs a tool on a tool server (obsidian-sync, code-tools) with `POST <url>`. The server is
 * authenticated by the caller's transport: either the `token` (code-tools) or the client
 * certificate of a custom `fetch` (obsidian-sync). A reply with `status: "error"` is a normal
 * tool error for ChatGPT; only a transport failure, a timeout or a reply that is not a JSON
 * object throws.
 */
export async function callToolServer({
    url, token, fetch: fetchFn = fetch, args, timeoutMs, serverName, signal,
}: {
    url: string;
    token?: string;
    fetch?: (url: string, init: RequestInit) => Promise<Response>;
    args: unknown;
    timeoutMs: number;
    serverName: string;
    signal?: AbortSignal;
}): Promise<ToolReply> {
    const response = await fetchFn(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...token !== undefined && { authorization: createBearerAuthorizationHeader(token) },
        },
        body: JSON.stringify(args),
        signal: signal
            ? AbortSignal.any([
                signal,
                AbortSignal.timeout(timeoutMs),
            ])
            : AbortSignal.timeout(timeoutMs),
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
