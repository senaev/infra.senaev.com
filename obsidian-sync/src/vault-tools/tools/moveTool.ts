import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';

import { readVaultToolArguments } from '../toolArguments';

import { type MoveCommandInput, moveCommand } from './moveCommand';

function parseMoveInput(input: unknown): MoveCommandInput {
    const args = readVaultToolArguments(input, 'move');

    return {
        path: requiredNonEmptyString(args, 'path'),
        newPath: requiredNonEmptyString(args, 'newPath'),
    };
}

export const moveTool = createCommandAdapter(parseMoveInput, moveCommand);
