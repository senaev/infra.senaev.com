import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
    CODE_COMMAND_ARGUMENTS, PROJECT_NAME_PATTERN, type CodeCommandName,
} from 'senaev-utils/src/codeTools/codeCommands';
import {
    operationCheckpoint, operationContext, throwIfOperationAborted,
} from 'senaev-utils/src/operations/operationContext';
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

/** The arguments of a code tool, which contain only domain fields. */
export function readCodeToolArguments(value: unknown, tool: CodeCommandName): ToolArguments {
    return readToolArguments(value, CODE_COMMAND_ARGUMENTS[tool]);
}

export function assertProjectName(name: string, field: string): void {
    if (!PROJECT_NAME.test(name)) {
        throw invalidArguments(`"${field}" must be a project folder name such as "my-repo": letters, digits, ".", "_" and "-"`);
    }
}

/** The project from the `project` argument; it must be an existing folder, not a symlink. */
export async function resolveProject(config: CodeToolsConfig, args: ToolArguments): Promise<Project> {
    await operationCheckpoint();
    const name = requiredNonEmptyString(args, 'project');

    assertProjectName(name, 'project');

    try {
        const root = await assertNoSymlinkOnPath(config.projectsRoot, name);

        const metadata = await stat(root);

        throwIfOperationAborted();
        if (metadata.isDirectory()) {
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

    throw new ToolError('not_found', `Project "${name}" does not exist; list the available projects`);
}

/**
 * A clean project-relative path from a tool argument. The `.git` folder is off limits for
 * the file tools, so they cannot damage the repository; shell commands can still use git.
 */
export function normalizeProjectPath(input: string, field: string): string {
    const path = normalizeRootRelativePath(input, field, 'project');

    if (path.split('/').includes('.git')) {
        throw new ToolError('forbidden_path', `"${field}" points into a .git folder; use git commands instead`);
    }

    return path;
}

/** The absolute path of an existing regular file, with no symlink on the way. */
export async function resolveExistingFile(project: Project, path: string): Promise<string> {
    await operationCheckpoint();
    if (path === '') {
        throw invalidArguments('The path must name a file, not the project root');
    }

    try {
        const absolutePath = await assertNoSymlinkOnPath(project.root, path);

        if (!(await stat(absolutePath)).isFile()) {
            throw new ToolError('not_found', `"${path}" is not a file`);
        }

        throwIfOperationAborted();

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
    await operationCheckpoint();
    if ((await stat(absolutePath)).size > MAX_TEXT_FILE_BYTES) {
        throw new ToolError('forbidden_path', `"${path}" is larger than ${MAX_TEXT_FILE_BYTES / 1024 / 1024} MB; use head, tail or sed to read parts of it`);
    }

    throwIfOperationAborted();
    const signal = operationContext()?.signal;
    const buffer = await readFile(absolutePath, signal === undefined ? {} : { signal });

    throwIfOperationAborted();

    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
        throw new ToolError('forbidden_path', `"${path}" is a binary file`);
    }

    return buffer.toString('utf8');
}

export function projectPath(config: CodeToolsConfig, name: string): string {
    return join(config.projectsRoot, name);
}
