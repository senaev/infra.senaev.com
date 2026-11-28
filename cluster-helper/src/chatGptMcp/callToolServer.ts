import { isObjectOrArray } from 'senaev-utils/src/types/Object/Object';
import { createAbortSignalWithTimeout } from 'senaev-utils/src/utils/Abort/createAbortSignalWithTimeout/createAbortSignalWithTimeout';
import type { MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';

import type { ToolReply } from './toolFamilies';

/**
 * A reply with `status: "error"` is a normal tool error for ChatGPT; only a reply that is
 * not a JSON object throws.
 */
export async function readToolReply(response: Response, serverName: string): Promise<ToolReply> {
    const body: unknown = await response.json();

    if (!isObjectOrArray(body) || Array.isArray(body)) {
        throw new Error(`${serverName} answered HTTP ${response.status} with a body that is not a JSON object`);
    }

    return {
        isError: !response.ok || body.status !== 'ok',
        body,
    };
}

/**
 * Runs a tool on a tool server (code-tools) with `POST <url>` through its mTLS client. A reply
 * with `status: "error"` is a normal tool error for ChatGPT; only a transport failure, a
 * timeout or a reply that is not a JSON object throws.
 */
export async function callToolServer({
    client, url, args, timeoutMs, serverName, signal,
}: { client: Pick<MtlsClient, 'fetch'>; url: string; args: unknown; timeoutMs: number; serverName: string; signal?: AbortSignal }): Promise<ToolReply> {
    const response = await client.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: createAbortSignalWithTimeout(timeoutMs, signal),
    });

    return readToolReply(response, serverName);
}
