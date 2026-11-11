import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    assertExistingFile, createParentFolders, normalizeAbsolutePath, readTextFile,
} from './fileAccess';

async function createFile(path: string, content: string, execution: CommandExecution): Promise<void> {
    try {
        await createParentFolders(path, execution);
        await createFileExclusively(path, content, execution.signal, () => execution.changedPath(path));
    } catch (error) {
        execution.throwIfAborted();
        if (isAlreadyExistsError(error)) {
            throw new CommandError('already_exists', `"${path}" already exists; read it and pass its "hash" as "expectedHash" to replace it`);
        }

        throw error;
    }
}

/** Replaces the whole file, but only the version the caller read. */
async function replaceFile(input: { path: string; content: string; expectedHash: string }, execution: CommandExecution) {
    const {
        path, content, expectedHash,
    } = input;

    await assertExistingFile(path, execution);
    const original = await readTextFile(path, execution);

    assertExpectedHash(original, expectedHash, 'file');

    const diff = await createFileDiffAsync(path, original, content, execution);

    if (content !== original) {
        assertExpectedHash(await readTextFile(path, execution), expectedHash, 'file');
        await replaceFileAtomically(path, content, execution.signal, () => execution.changedPath(path));
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

    execution.throwIfAborted();

    return await withFileMutation(path, async () => {
        const isReplace = expectedHash !== undefined;
        let original = '';
        let diff;

        if (expectedHash !== undefined) {
            ({ original, diff } = await replaceFile({
                path,
                content,
                expectedHash,
            }, execution));
        } else {
            diff = await createFileDiffAsync(path, original, content, execution);
            await createFile(path, content, execution);
        }

        await execution.checkpoint();

        return {
            path,
            created: !isReplace,
            changed: content !== original || !isReplace,
            hash: hashContent(content),
            ...diff,
        };
    }, execution);
}

export type WriteCommandResult = Awaited<ReturnType<typeof writeCommand>>;
