import { createTool } from './tools/createTool';
import { diaryAppendTool } from './tools/diaryAppendTool';
import { linksTool } from './tools/linksTool';
import { listTool } from './tools/listTool';
import { patchTool } from './tools/patchTool';
import { readTool } from './tools/readTool';
import { searchTool } from './tools/searchTool';
import type { VaultToolsConfig } from './vaultToolsConfig';

export type VaultTool = (config: VaultToolsConfig, input: unknown) => Promise<Record<string, unknown>>;

/** Served as `POST /vault/<name>`; cluster-helper exposes each one as `obsidian-<name>`. */
export const VAULT_TOOLS: Readonly<Record<string, VaultTool>> = {
    list: listTool,
    search: searchTool,
    read: readTool,
    links: linksTool,
    create: createTool,
    patch: patchTool,
    diary_append: diaryAppendTool,
};
