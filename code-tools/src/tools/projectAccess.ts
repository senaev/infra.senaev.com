import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
    getCodeToolArgumentKeys, PROJECT_NAME_PATTERN, type CodeToolName,
} from 'senaev-utils/src/codeTools/codeToolDefinitions';
import { assertNoSymlinkOnPath, normalizeRootRelativePath } from 'senaev-utils/src/toolServer/rootRelativePath';
import {
    readToolArguments, requiredNonEmptyString, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import type { CodeToolsConfig } from './codeToolsConfig';

const PROJECT_NAME = new RegExp(PROJECT_NAME_PATTERN);
const BINARY_SNIFF_BYTES = 8000;
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

export type Project = {
    name: string;
    root: string;
};

/** The arguments of a code tool, which may use exactly the keys of its shared input schema. */
export function readCodeToolArguments(value: unknown, tool: CodeToolName): ToolArguments {
    return readToolArguments(value, getCodeToolArgumentKeys(tool));
}

export function assertProjectName(name: string, field: string): void {
    if (!PROJECT_NAME.test(name)) {
        throw invalidArguments(`"${field}" must be a project folder name such as "my-repo": letters, digits, ".", "_" and "-"`);
    }
}

/** The project from the `project` argument; it must be an existing folder, not a symlink. */
export async function resolveProject(config: CodeToolsConfig, args: ToolArguments): Promise<Project> {
    const name = requiredNonEmptyString(args, 'project');

    assertProjectName(name, 'project');

    try {
        const root = await assertNoSymlinkOnPath(config.projectsRoot, name);

        if ((await stat(root)).isDirectory()) {
            return {
                name,
                root,
            };
        }
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }

    throw new ToolError('not_found', `Project "${name}" does not exist; call code-projects to see the projects`);
}

/**
 * A clean project-relative path from a tool argument. The `.git` folder is off limits for
 * the file tools, so they cannot damage the repository; `code-run` can still use git.
 */
export function normalizeProjectPath(input: string, field: string): string {
    const path = normalizeRootRelativePath(input, field, 'project');

    if (path.split('/').includes('.git')) {
        throw new ToolError('forbidden_path', `"${field}" points into a .git folder; use git commands with code-run instead`);
    }

    return path;
}

/** The absolute path of an existing regular file, with no symlink on the way. */
export async function resolveExistingFile(project: Project, path: string): Promise<string> {
    if (path === '') {
        throw invalidArguments('The path must name a file, not the project root');
    }

    try {
        const absolutePath = await assertNoSymlinkOnPath(project.root, path);

        if (!(await stat(absolutePath)).isFile()) {
            throw new ToolError('not_found', `"${path}" is not a file`);
        }

        return absolutePath;
    } catch (error) {
        if (isNotFoundError(error)) {
            throw new ToolError('not_found', `File "${path}" does not exist`);
        }

        throw error;
    }
}

/** Reads a UTF-8 text file. A file with a NUL byte near its start is treated as binary, as git does. */
export async function readTextFile(absolutePath: string, path: string): Promise<string> {
    if ((await stat(absolutePath)).size > MAX_TEXT_FILE_BYTES) {
        throw new ToolError('forbidden_path', `"${path}" is larger than ${MAX_TEXT_FILE_BYTES / 1024 / 1024} MB; use code-run with head, tail or sed to read parts of it`);
    }

    const buffer = await readFile(absolutePath);

    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
        throw new ToolError('forbidden_path', `"${path}" is a binary file`);
    }

    return buffer.toString('utf8');
}

export function projectPath(config: CodeToolsConfig, name: string): string {
    return join(config.projectsRoot, name);
}
