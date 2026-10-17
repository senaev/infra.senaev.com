import type { CommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import type { VaultCommandName } from 'senaev-utils/src/obsidianVaultTools/vaultCommands';

import { createTool } from './tools/createTool';
import { diaryAppendTool } from './tools/diaryAppendTool';
import { linksTool } from './tools/linksTool';
import { listTool } from './tools/listTool';
import { moveTool } from './tools/moveTool';
import { patchTool } from './tools/patchTool';
import { readTool } from './tools/readTool';
import { searchTool } from './tools/searchTool';
import { tasksCreateTool } from './tools/tasksCreateTool';
import { tasksListTool } from './tools/tasksListTool';
import { tasksUpdateTool } from './tools/tasksUpdateTool';
import type { VaultToolsConfig } from './vaultToolsConfig';

export type VaultTool = CommandAdapter<VaultToolsConfig>;

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
    tasks_list: tasksListTool,
    tasks_create: tasksCreateTool,
    tasks_update: tasksUpdateTool,
};
