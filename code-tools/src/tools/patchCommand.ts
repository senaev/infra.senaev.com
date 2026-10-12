import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { replaceExactlyOnceAsync as replaceText } from 'senaev-utils/src/files/textEdits';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath, readTextFile, resolveExistingFile, resolveNamedProject,
} from './projectAccess';

export type Replacement = {
    find: string;
    replace: string;
};

/**
 * Applies all replacements in memory, in order, and writes the result once. If one fails,
 * nothing is written. The new hash lets the caller edit the same file again at once.
 */
export type PatchCommandInput = { project: string; path: string; expectedHash: string; operations: readonly Replacement[] };

export async function patchCommand(config: CodeToolsConfig, input: PatchCommandInput, execution: CommandExecution) {
    const project = await resolveNamedProject(config, input.project, execution);
    const path = normalizeProjectPath(input.path, 'path');
    const { expectedHash, operations } = input;

    return withFileMutation(`${project.root}/${path}`, async () => {
        const absolutePath = await resolveExistingFile(project, path, execution);
        const original = await readTextFile(absolutePath, path, execution);

        assertExpectedHash(original, expectedHash, 'file');

        let updated = original;

        for (const operation of operations) {
            await execution.checkpoint();
            updated = await replaceText(updated, operation.find, operation.replace, { execution });
        }

        const diff = await createFileDiffAsync(path, original, updated, execution);

        execution.throwIfAborted();

        if (updated !== original) {
            assertExpectedHash(await readTextFile(absolutePath, path, execution), expectedHash, 'file');
            await replaceFileAtomically(absolutePath, updated, execution.signal, () => execution.changedPath(path));
        }

        await execution.checkpoint();

        return {
            path,
            changed: updated !== original,
            hash: hashContent(updated),
            ...diff,
        };
    }, execution);
}

export type PatchCommandResult = Awaited<ReturnType<typeof patchCommand>>;
