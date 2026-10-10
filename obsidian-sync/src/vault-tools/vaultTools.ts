import type { VaultToolName } from 'senaev-utils/src/obsidianVaultTools/vaultToolDefinitions';

import { createTool } from './tools/createTool';
import { diaryAppendTool } from './tools/diaryAppendTool';
import { linksTool } from './tools/linksTool';
import { listTool } from './tools/listTool';
import { moveTool } from './tools/moveTool';
import { patchTool } from './tools/patchTool';
import { readTool } from './tools/readTool';
import { searchTool } from './tools/searchTool';
import type { VaultToolsConfig } from './vaultToolsConfig';

export type VaultTool = (config: VaultToolsConfig, input: unknown) => Promise<Record<string, unknown>>;

/**
 * Served as `POST /vault/<name>`; cluster-helper exposes each one as `obsidian-<name>`. The
 * names and argument schemas are in senaev-utils, so a missing tool fails to compile.
 */
export const VAULT_TOOLS: Readonly<Record<VaultToolName, VaultTool>> = {
    list: listTool,
    search: searchTool,
    read: readTool,
    links: linksTool,
    create: createTool,
    patch: patchTool,
    move: moveTool,
    diary_append: diaryAppendTool,
};
