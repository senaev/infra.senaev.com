import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { prepareNewFilePath } from 'senaev-utils/src/files/rootRelativePath';
import { invalidArguments, CommandError } from 'senaev-utils/src/commands/CommandError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath, type Project, readTextFile, resolveExistingFile, resolveNamedProject,
} from './projectAccess';

async function createFile(project: Project, path: string, content: string, execution: CommandExecution): Promise<void> {
    try {
        await createFileExclusively(await prepareNewFilePath(project.root, path, execution), content, execution.signal, () => execution.changedPath(path));
    } catch (error) {
        execution.throwIfAborted();
        if (isAlreadyExistsError(error)) {
            throw new CommandError('already_exists', `"${path}" already exists; read it and pass its "hash" as "expectedHash" to replace it`);
        }

        throw error;
    }
}

/** Replaces the whole file, but only the version the caller read. */
async function replaceFile(project: Project, input: { path: string; content: string; expectedHash: string }, execution: CommandExecution) {
    const {
        path, content, expectedHash,
    } = input;
    const absolutePath = await resolveExistingFile(project, path, execution);
    const original = await readTextFile(absolutePath, path, execution);

    assertExpectedHash(original, expectedHash, 'file');

    const diff = await createFileDiffAsync(path, original, content, execution);

    if (content !== original) {
        assertExpectedHash(await readTextFile(absolutePath, path, execution), expectedHash, 'file');
        await replaceFileAtomically(absolutePath, content, execution.signal, () => execution.changedPath(path));
    }

    return {
        original,
        diff,
    };
}

export type WriteCommandInput = { project: string; path: string; content: string; expectedHash: string | undefined };

export async function writeCommand(config: CodeToolsConfig, input: WriteCommandInput, execution: CommandExecution) {
    const project = await resolveNamedProject(config, input.project, execution);
    const path = normalizeProjectPath(input.path, 'path');
    const { content, expectedHash } = input;

    if (path === '') {
        throw invalidArguments('"path" must name a file, not the project root');
    }

    execution.throwIfAborted();

    return withFileMutation(`${project.root}/${path}`, async () => {
        const isReplace = expectedHash !== undefined;
        let original = '';
        let diff;

        if (expectedHash !== undefined) {
            ({ original, diff } = await replaceFile(project, {
                path,
                content,
                expectedHash,
            }, execution));
        } else {
            diff = await createFileDiffAsync(path, original, content, execution);
            await createFile(project, path, content, execution);
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
