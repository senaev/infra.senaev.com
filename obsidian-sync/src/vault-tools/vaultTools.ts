import type { VaultCommandName } from 'senaev-utils/src/obsidianVaultTools/vaultCommands';

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

/** Domain command registry; missing implementations fail to compile. */
export const VAULT_TOOLS: Readonly<Record<VaultCommandName, VaultTool>> = {
    list: listTool,
    search: searchTool,
    read: readTool,
    links: linksTool,
    create: createTool,
    patch: patchTool,
    move: moveTool,
    diary_append: diaryAppendTool,
};
