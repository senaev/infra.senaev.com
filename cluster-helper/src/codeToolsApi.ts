import { isManagedCodeToolName } from 'senaev-utils/src/codeTools/codeToolDefinitions';
import { OBSERVATION_MS } from 'senaev-utils/src/operations/operationLimits';
import { isOperationToolName } from 'senaev-utils/src/operations/operationToolDefinitions';
import { CLONE_LIMITS, RUN_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';

import { callToolServer } from './chatGptMcp/callToolServer';
import type { ToolReply } from './chatGptMcp/toolFamilies';
import { CODE_TOOLS_URL, INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS } from './env';

/** code-run and code-clone may take minutes; the margin covers git and the HTTP round trip. */
const CODE_TOOL_TIMEOUT_MS = (Math.max(RUN_LIMITS.maxTimeoutSeconds, CLONE_LIMITS.timeoutSeconds) + 30) * 1000;

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
