import {
    isVaultToolName,
    OBSIDIAN_TOOL_PREFIX,
    VAULT_TOOL_DEFINITIONS,
    VAULT_TOOL_NAMES,
    type VaultToolName,
} from 'senaev-utils/src/obsidianVaultTools/vaultToolDefinitions';

// The definitions are shared with obsidian-sync, which validates every argument. They are
// compiled in rather than fetched, so tools/list works also when obsidian-sync is down.
export const OBSIDIAN_TOOLS = VAULT_TOOL_NAMES.map((name) => {
    return {
        name: `${OBSIDIAN_TOOL_PREFIX}${name}`,
        ...VAULT_TOOL_DEFINITIONS[name],
    };
});

/** The obsidian-sync tool behind an MCP tool name, or `null` for a name that is not ours. */
export function getVaultToolName(mcpToolName: unknown): VaultToolName | null {
    if (typeof mcpToolName !== 'string' || !mcpToolName.startsWith(OBSIDIAN_TOOL_PREFIX)) {
        return null;
    }

    const name = mcpToolName.slice(OBSIDIAN_TOOL_PREFIX.length);

    return isVaultToolName(name) ? name : null;
}
