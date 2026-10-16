import type { CommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import type { CodeCommandName } from 'senaev-utils/src/codeTools/codeCommands';

import type { CodeToolsConfig } from './codeToolsConfig';
import { listTool } from './listTool';
import { patchTool } from './patchTool';
import { projectsTool } from './projectsTool';
import { readTool } from './readTool';
import { runTool } from './runTool';
import { searchTool } from './searchTool';
import { writeTool } from './writeTool';

export type CodeTool = CommandAdapter<CodeToolsConfig>;

/** Typed by the domain command contract, so a tool without an implementation does not compile. */
export const CODE_TOOLS: Record<CodeCommandName, CodeTool> = {
    projects: projectsTool,
    list: listTool,
    search: searchTool,
    read: readTool,
    write: writeTool,
    patch: patchTool,
    run: runTool,
};
