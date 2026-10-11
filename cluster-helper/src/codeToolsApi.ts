import { TRANSPORT_TIMEOUT_MS } from 'senaev-utils/src/operations/operationLimits';

import { callToolServer } from './chatGptMcp/callToolServer';
import type { ToolReply } from './chatGptMcp/toolFamilies';
import { CODE_TOOLS_URL, INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS } from './env';

/** Runs a code tool in the opencode-serve pod with `POST /code/<name>`. */
export function callCodeTool(codeToolName: string, args: unknown): Promise<ToolReply> {
    return callToolServer({
        url: `${CODE_TOOLS_URL}/code/${encodeURIComponent(codeToolName)}`,
        token: INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS,
        args,
        timeoutMs: TRANSPORT_TIMEOUT_MS,
        serverName: 'code-tools',
    });
}
