import { PATCH_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { readExpectedHash } from 'senaev-utils/src/toolServer/expectedHashArguments';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import {
    readToolArguments, requiredNonEmptyString, requiredString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { readCodeToolArguments } from './toolArguments';
import {
    type PatchCommandInput, type Replacement, patchCommand,
} from './patchCommand';

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

function parsePatchInput(input: unknown): PatchCommandInput {
    const args = readCodeToolArguments(input, 'patch');

    return {
        project: requiredNonEmptyString(args, 'project'),
        path: requiredNonEmptyString(args, 'path'),
        expectedHash: readExpectedHash(args, 'expectedHash'),
        operations: readOperations(args.operations),
    };
}

export const patchTool = createCommandAdapter(parsePatchInput, patchCommand);
