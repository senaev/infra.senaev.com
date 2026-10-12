import { PATCH_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    assertExpectedHash, hashContent, readExpectedHash,
} from 'senaev-utils/src/toolServer/contentHash';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import {
    readToolArguments, requiredNonEmptyString, requiredString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/toolServer/ToolError';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { createFileDiffAsync } from 'senaev-utils/src/toolServer/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/toolServer/withFileMutation';
import { replaceExactlyOnceAsync as replaceText } from 'senaev-utils/src/toolServer/textEdits';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath, readCodeToolArguments, readTextFile, resolveExistingFile, resolveNamedProject,
} from './projectAccess';

type Replacement = {
    find: string;
    replace: string;
};

function readOperations(value: unknown): Replacement[] {
    const { maxOperations } = PATCH_LIMITS;

    if (!Array.isArray(value) || value.length === 0 || value.length > maxOperations) {
        throw invalidArguments(`"operations" must be an array of 1 to ${maxOperations} operations`);
    }

    return value.map((item: unknown) => {
        const operation = readToolArguments(item, [
            'find',
            'replace',
        ]);

        return {
            find: requiredNonEmptyString(operation, 'find'),
            replace: requiredString(operation, 'replace'),
        };
    });
}

/**
 * Applies all replacements in memory, in order, and writes the result once. If one fails,
 * nothing is written. The new hash lets the caller edit the same file again at once.
 */
export type PatchCommandInput = { project: string; path: string; expectedHash: string; operations: readonly Replacement[] };

function parsePatchInput(input: unknown): PatchCommandInput {
    const args = readCodeToolArguments(input, 'patch');

    return {
        project: requiredNonEmptyString(args, 'project'),
        path: requiredNonEmptyString(args, 'path'),
        expectedHash: readExpectedHash(args, 'expectedHash'),
        operations: readOperations(args.operations),
    };
}

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
export const patchTool = createCommandAdapter(parsePatchInput, patchCommand);
