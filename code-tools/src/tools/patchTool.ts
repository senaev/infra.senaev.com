import { PATCH_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    assertExpectedHash, hashContent, readExpectedHash,
} from 'senaev-utils/src/toolServer/contentHash';
import {
    operationCheckpoint, operationContext, recordChangedPath, throwIfOperationAborted,
} from 'senaev-utils/src/operations/operationContext';
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
    normalizeProjectPath, readCodeToolArguments, readTextFile, resolveExistingFile, resolveProject,
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
export async function patchTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'patch');
    const project = await resolveProject(config, args);
    const path = normalizeProjectPath(requiredNonEmptyString(args, 'path'), 'path');
    const expectedHash = readExpectedHash(args, 'expectedHash');
    const operations = readOperations(args.operations);

    return withFileMutation(`${project.root}/${path}`, async () => {
        const absolutePath = await resolveExistingFile(project, path);
        const original = await readTextFile(absolutePath, path);

        assertExpectedHash(original, expectedHash, 'file');

        let updated = original;

        for (const operation of operations) {
            await operationCheckpoint();
            updated = await replaceText(updated, operation.find, operation.replace);
        }

        const diff = await createFileDiffAsync(path, original, updated);

        throwIfOperationAborted();

        if (updated !== original) {
            assertExpectedHash(await readTextFile(absolutePath, path), expectedHash, 'file');
            await replaceFileAtomically(absolutePath, updated, operationContext()?.signal, () => recordChangedPath(path));
        }

        await operationCheckpoint();

        return {
            path,
            changed: updated !== original,
            hash: hashContent(updated),
            ...diff,
        };
    });
}
