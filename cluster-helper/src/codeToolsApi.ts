import { isManagedCodeToolName } from 'senaev-utils/src/codeTools/codeToolDefinitions';
import { OBSERVATION_MS } from 'senaev-utils/src/operations/operationLimits';
import { isOperationToolName } from 'senaev-utils/src/operations/operationToolDefinitions';
import { CLONE_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';

import { callToolServer } from './chatGptMcp/callToolServer';
import type { ToolReply } from './chatGptMcp/toolFamilies';
import { CODE_TOOLS_URL, INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS } from './env';

/** Remaining direct tools (including clone) retain their transport budget. */
const CODE_TOOL_TIMEOUT_MS = (CLONE_LIMITS.timeoutSeconds + 30) * 1000;

/** Runs a code tool in the opencode-serve pod with `POST /code/<name>`. */
export function callCodeTool(codeToolName: string, args: unknown): Promise<ToolReply> {
    return callToolServer({
        url: `${CODE_TOOLS_URL}/code/${encodeURIComponent(codeToolName)}`,
        token: INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS,
        args,
        timeoutMs: isManagedCodeToolName(codeToolName) || isOperationToolName(codeToolName)
            ? OBSERVATION_MS + 10_000
            : CODE_TOOL_TIMEOUT_MS,
        serverName: 'code-tools',
    });
}
