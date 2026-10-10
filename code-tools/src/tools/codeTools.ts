import type { CodeToolName } from 'senaev-utils/src/codeTools/codeToolDefinitions';

import { cloneTool } from './cloneTool';
import type { CodeToolsConfig } from './codeToolsConfig';
import { listTool } from './listTool';
import { patchTool } from './patchTool';
import { projectsTool } from './projectsTool';
import { readTool } from './readTool';
import { runTool } from './runTool';
import { searchTool } from './searchTool';
import { writeTool } from './writeTool';

export type CodeTool = (config: CodeToolsConfig, input: unknown) => Promise<Record<string, unknown>>;

/** Typed by the shared definitions, so a tool without an implementation does not compile. */
export const CODE_TOOLS: Record<CodeToolName, CodeTool> = {
    projects: projectsTool,
    clone: cloneTool,
    list: listTool,
    search: searchTool,
    read: readTool,
    write: writeTool,
    patch: patchTool,
    run: runTool,
};
