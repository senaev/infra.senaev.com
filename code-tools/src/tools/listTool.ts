import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { LIST_LIMITS, MAX_GLOB_LENGTH } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    optionalBoolean, readPageArguments, optionalString, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';

import { readCodeToolArguments } from './toolArguments';
import { type ListCommandInput, listCommand } from './listCommand';

function parseListInput(input: unknown): ListCommandInput {
    const args = readCodeToolArguments(input, 'list');
    const folder = optionalString(args, 'folder') ?? '';
    const glob = optionalString(args, 'glob', MAX_GLOB_LENGTH);
    const recursive = optionalBoolean(args, 'recursive') ?? false;
    const { offset, limit } = readPageArguments(args, LIST_LIMITS);

    return {
        project: requiredNonEmptyString(args, 'project'),
        folder,
        glob,
        recursive,
        offset,
        limit,
    };
}

export const listTool = createCommandAdapter(parseListInput, listCommand);
