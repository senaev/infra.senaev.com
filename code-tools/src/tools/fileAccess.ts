import {
    mkdir, readFile, realpath, stat,
} from 'node:fs/promises';
import { posix } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { invalidArguments, CommandError } from 'senaev-utils/src/commands/CommandError';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

const BINARY_SNIFF_BYTES = 8000;
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

/** A clean absolute POSIX path from a tool argument, without a trailing "/". */
export function normalizeAbsolutePath(input: string, field: string): string {
    if (input.includes('\0')) {
        throw invalidArguments(`"${field}" contains a forbidden character`);
    }

    if (!posix.isAbsolute(input)) {
        throw invalidArguments(`"${field}" must be an absolute path such as "/code/projects/my-repo"`);
    }

    const normalized = posix.normalize(input);

    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

async function statOrNotFound(path: string, what: string, execution: CommandExecution) {
    await execution.checkpoint();
    try {
        const metadata = await stat(path);

        execution.throwIfAborted();

        return metadata;
    } catch (error) {
        execution.throwIfAborted();
        if (isNotFoundError(error)) {
            throw new CommandError('not_found', `${what} "${path}" does not exist`);
        }

        throw error;
    }
}

export async function assertExistingFile(path: string, execution: CommandExecution): Promise<void> {
    if (!(await statOrNotFound(path, 'File', execution)).isFile()) {
        throw new CommandError('not_found', `"${path}" is not a file`);
    }
}

/**
 * The real path of an existing file. Writes go there: a rename onto a symbolic link would
 * replace the link and leave its target unchanged.
 */
export async function resolveExistingFile(path: string, execution: CommandExecution): Promise<string> {
    await assertExistingFile(path, execution);
    const target = await realpath(path);

    execution.throwIfAborted();

    return target;
}

export async function assertExistingFolder(path: string, execution: CommandExecution): Promise<void> {
    if (!(await statOrNotFound(path, 'Folder', execution)).isDirectory()) {
        throw new CommandError('not_found', `"${path}" is not a folder`);
    }
}

/** Creates the missing parent folders of a new file and reports the first one it created. */
export async function createParentFolders(path: string, execution: CommandExecution): Promise<void> {
    await execution.checkpoint();
    try {
        const created = await mkdir(posix.dirname(path), { recursive: true });

        if (created !== undefined) {
            execution.changedPath(created);
        }
    } catch (error) {
        execution.throwIfAborted();
        throw new CommandError('command_failed', `Cannot create the folder of "${path}": ${error instanceof Error ? error.message : String(error)}`);
    }

    execution.throwIfAborted();
}

/** Reads a UTF-8 text file. A file with a NUL byte near its start is treated as binary, as git does. */
export async function readTextFile(path: string, execution: CommandExecution): Promise<string> {
    await execution.checkpoint();
    try {
        if ((await stat(path)).size > MAX_TEXT_FILE_BYTES) {
            throw new CommandError('forbidden_path', `"${path}" is larger than ${MAX_TEXT_FILE_BYTES / 1024 / 1024} MB; use head, tail or sed to read parts of it`);
        }

        execution.throwIfAborted();
        const { signal } = execution;
        const buffer = await readFile(path, { signal });

        execution.throwIfAborted();

        if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
            throw new CommandError('forbidden_path', `"${path}" is a binary file`);
        }

        return buffer.toString('utf8');
    } catch (error) {
        execution.throwIfAborted();
        throw error;
    }
}
