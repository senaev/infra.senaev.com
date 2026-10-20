import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { LIST_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { optionalBoolean, readPageArguments } from 'senaev-utils/src/toolServer/toolArguments';

import { readNoteScope } from '../noteScopeArguments';
import { readVaultToolArguments } from '../toolArguments';

import { type ListCommandInput, listCommand } from './listCommand';

function parseListInput(input: unknown): ListCommandInput {
    const args = readVaultToolArguments(input, 'list');
    const scope = readNoteScope(args);
    const { offset, limit } = readPageArguments(args, LIST_LIMITS);
    const recursive = optionalBoolean(args, 'recursive') === true;

    return {
        scope,
        includeAttachments: optionalBoolean(args, 'includeAttachments') === true,
        recursive,
        offset,
        limit,
    };
}

export const listTool = createCommandAdapter(parseListInput, listCommand);
