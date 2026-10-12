import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { PATCH_OPERATION_FIELDS } from 'senaev-utils/src/obsidianVaultTools/vaultCommands';
import { PATCH_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { readExpectedHash } from 'senaev-utils/src/toolServer/expectedHashArguments';
import {
    optionalString, readToolArguments, requiredNonEmptyString, requiredString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { readVaultToolArguments } from '../toolArguments';

import {
    type PatchCommandInput, type PatchOperation, patchCommand,
} from './patchCommand';

function readOperations(value: unknown): PatchOperation[] {
    const { maxOperations } = PATCH_LIMITS;

    if (!Array.isArray(value) || value.length === 0 || value.length > maxOperations) {
        throw invalidArguments(`"operations" must be an array of 1 to ${maxOperations} operations`);
    }

    return value.map((item: unknown, index): PatchOperation => {
        const type = isObject(item) ? item.type : undefined;

        if (typeof type !== 'string' || !Object.hasOwn(PATCH_OPERATION_FIELDS, type)) {
            throw invalidArguments(`"operations[${index}].type" must be one of: ${Object.keys(PATCH_OPERATION_FIELDS).join(', ')}`);
        }

        const name = type as keyof typeof PATCH_OPERATION_FIELDS;
        const args = readToolArguments(item, [
            'type',
            ...PATCH_OPERATION_FIELDS[name],
        ]);

        switch (name) {
        case 'append': return {
            type: name,
            text: requiredNonEmptyString(args, 'text'),
            section: optionalString(args, 'section'),
        };
        case 'replace': return {
            type: name,
            find: requiredNonEmptyString(args, 'find'),
            replace: requiredString(args, 'replace'),
        };
        case 'replaceSection': return {
            type: name,
            section: requiredNonEmptyString(args, 'section'),
            content: requiredString(args, 'content'),
        };
        case 'setFrontmatter': {
            const { properties } = args;

            if (!isObject(properties) || Array.isArray(properties) || Object.keys(properties).length === 0) {
                throw invalidArguments('"properties" must be a non-empty JSON object; use null as a value to delete a property');
            }

            return {
                type: name,
                properties,
            };
        }

        default: throw invalidArguments('Unsupported patch operation');
        }
    });
}

function parsePatchInput(input: unknown): PatchCommandInput {
    const args = readVaultToolArguments(input, 'patch');

    return {
        path: requiredNonEmptyString(args, 'path'),
        expectedHash: readExpectedHash(args, 'expectedHash'),
        operations: readOperations(args.operations),
    };
}

export const patchTool = createCommandAdapter(parsePatchInput, patchCommand);
