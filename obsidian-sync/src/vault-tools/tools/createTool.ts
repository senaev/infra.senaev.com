import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import {
    optionalObject, optionalString, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';

import { readVaultToolArguments } from '../toolArguments';

import { type CreateCommandInput, createCommand } from './createCommand';

function parseCreateInput(input: unknown): CreateCommandInput {
    const args = readVaultToolArguments(input, 'create');

    return {
        path: requiredNonEmptyString(args, 'path'),
        content: optionalString(args, 'content') ?? '',
        frontmatter: optionalObject(args, 'frontmatter'),
    };
}

export const createTool = createCommandAdapter(parseCreateInput, createCommand);
