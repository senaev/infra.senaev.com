import { TRANSPORT_TIMEOUT_MS } from 'senaev-utils/src/operations/operationLimits';
import type { MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';

import { callToolServer } from './chatGptMcp/callToolServer';
import type { ToolReply } from './chatGptMcp/toolFamilies';
import { CODE_TOOLS_URL } from './env';

export type CodeToolsApi = ReturnType<typeof createCodeToolsApi>;

/**
 * Every call to code-tools goes through the client, because code-tools rejects any caller without
 * the client certificate that the client presents. The client talks only to code-tools.
 */
export function createCodeToolsApi(client: Pick<MtlsClient, 'fetch'>) {
    /** Runs a code tool in code-tools with `POST /code/<name>`. */
    function callCodeTool(codeToolName: string, args: unknown): Promise<ToolReply> {
        return callToolServer({
            client,
            url: `${CODE_TOOLS_URL}/code/${encodeURIComponent(codeToolName)}`,
            args,
            timeoutMs: TRANSPORT_TIMEOUT_MS,
            serverName: 'code-tools',
        });
    }

    return { callCodeTool };
}
