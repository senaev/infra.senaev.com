import { stat } from 'node:fs/promises';

import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { invalidArguments, CommandError } from 'senaev-utils/src/commands/CommandError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    createParentFolders, normalizeAbsolutePath, readTextFile, resolveExistingFile,
} from './fileAccess';

async function isFolder(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

function folderError(path: string) {
    return invalidArguments(`"${path}" is a folder; "path" must name a file`);
}

async function createFile(path: string, content: string, execution: CommandExecution) {
    // Checked before the write too, which first creates a temporary file in the parent folder.
    if (await isFolder(path)) {
        throw folderError(path);
    }

    const diff = await createFileDiffAsync(path, '', content, execution);

    try {
        await createParentFolders(path, execution);
        await createFileExclusively(path, content, execution.signal, () => execution.changedPath(path));
    } catch (error) {
        execution.throwIfAborted();
        if (isAlreadyExistsError(error)) {
            if (await isFolder(path)) {
                throw folderError(path);
            }

            throw new CommandError('already_exists', `"${path}" already exists; read it and pass its "hash" as "expectedHash" to replace it`);
        }

        throw error;
    }

    return {
        original: '',
        diff,
    };
}

/** Replaces the whole file, but only the version the caller read. */
async function replaceFile(input: { path: string; target: string; content: string; expectedHash: string }, execution: CommandExecution) {
    const {
        path, target, content, expectedHash,
    } = input;
    const original = await readTextFile(target, execution);

    assertExpectedHash(original, expectedHash, 'file');

    const diff = await createFileDiffAsync(path, original, content, execution);

    if (content !== original) {
        assertExpectedHash(await readTextFile(target, execution), expectedHash, 'file');
        await replaceFileAtomically(target, content, execution.signal, () => execution.changedPath(target));
    }

    return {
        original,
        diff,
    };
}

export type WriteCommandInput = { path: string; content: string; expectedHash: string | undefined };

export async function writeCommand(_config: CodeToolsConfig, input: WriteCommandInput, execution: CommandExecution) {
    const path = normalizeAbsolutePath(input.path, 'path');
    const { content, expectedHash } = input;
    const target = expectedHash === undefined ? path : await resolveExistingFile(path, execution);

    execution.throwIfAborted();

    return await withFileMutation(target, async () => {
        const { original, diff } = expectedHash === undefined
            ? await createFile(path, content, execution)
            : await replaceFile({
                path,
                target,
                content,
                expectedHash,
            }, execution);

        await execution.checkpoint();

        return {
            path,
            created: expectedHash === undefined,
            changed: content !== original || expectedHash === undefined,
            hash: hashContent(content),
            ...diff,
        };
    }, execution);
}

export type WriteCommandResult = Awaited<ReturnType<typeof writeCommand>>;
