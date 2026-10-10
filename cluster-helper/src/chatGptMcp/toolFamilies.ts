import { CODE_TOOL_DEFINITIONS, CODE_TOOL_PREFIX } from 'senaev-utils/src/codeTools/codeToolDefinitions';
import { OBSIDIAN_TOOL_PREFIX, VAULT_TOOL_DEFINITIONS } from 'senaev-utils/src/obsidianVaultTools/vaultToolDefinitions';
import type { ToolDefinition } from 'senaev-utils/src/toolServer/toolDefinition';

export type ToolReply = {
    isError: boolean;
    body: Record<string, unknown>;
};

/** Runs one backend tool with the arguments exactly as ChatGPT sent them. */
export type CallTool = (toolName: string, args: unknown) => Promise<ToolReply>;

/**
 * A group of MCP tools served by one backend. The definitions are shared with the backend,
 * which validates every argument; they are compiled in rather than fetched, so tools/list
 * works also when the backend is down.
 */
export type ToolFamily = {
    prefix: string;
    definitions: Readonly<Record<string, ToolDefinition>>;
    /** Names the backend in the error that ChatGPT gets when it cannot be reached. */
    backendName: string;
    call: CallTool;
};

export type McpTool = ToolDefinition & { name: string };

export function createToolFamilies({ callVaultTool, callCodeTool }: { callVaultTool: CallTool; callCodeTool: CallTool }): ToolFamily[] {
    return [
        {
            prefix: OBSIDIAN_TOOL_PREFIX,
            definitions: VAULT_TOOL_DEFINITIONS,
            backendName: 'The Obsidian vault',
            call: callVaultTool,
        },
        {
            prefix: CODE_TOOL_PREFIX,
            definitions: CODE_TOOL_DEFINITIONS,
            backendName: 'The code tools server',
            call: callCodeTool,
        },
    ];
}

export function listMcpTools(families: readonly ToolFamily[]): McpTool[] {
    return families.flatMap((family) => Object.entries(family.definitions).map(([
        name,
        definition,
    ]) => {
        return {
            name: `${family.prefix}${name}`,
            ...definition,
        };
    }));
}

/** The family and backend tool behind an MCP tool name, or `null` for a name that is not ours. */
export function findTool(families: readonly ToolFamily[], mcpToolName: unknown): { family: ToolFamily; toolName: string } | null {
    if (typeof mcpToolName !== 'string') {
        return null;
    }

    for (const family of families) {
        const toolName = mcpToolName.slice(family.prefix.length);

        if (mcpToolName.startsWith(family.prefix) && Object.hasOwn(family.definitions, toolName)) {
            return {
                family,
                toolName,
            };
        }
    }

    return null;
}
