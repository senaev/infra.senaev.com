import { PATCH_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    assertExpectedHash, hashContent, readExpectedHash,
} from 'senaev-utils/src/toolServer/contentHash';
import { createFileDiff } from 'senaev-utils/src/toolServer/createFileDiff';
import { replaceExactlyOnce } from 'senaev-utils/src/toolServer/textEdits';
import {
    readToolArguments, requiredNonEmptyString, requiredString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/toolServer/ToolError';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';

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
    const expectedHash = readExpectedHash(args, 'expectedHash', 'code-read');
    const operations = readOperations(args.operations);
    const absolutePath = await resolveExistingFile(project, path);
    const original = await readTextFile(absolutePath, path);

    assertExpectedHash(original, expectedHash, 'file');

    const updated = operations.reduce((content, operation) => replaceExactlyOnce(content, operation.find, operation.replace, 'file'), original);

    if (updated !== original) {
        await replaceFileAtomically(absolutePath, updated);
    }

    return {
        path,
        changed: updated !== original,
        hash: hashContent(updated),
        ...createFileDiff(path, original, updated),
    };
}
