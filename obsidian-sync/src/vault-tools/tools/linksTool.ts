import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { LINKS_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import {
    readPageArguments, optionalEnum, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';

import { readVaultToolArguments } from '../toolArguments';

import { type LinksCommandInput, linksCommand } from './linksCommand';

function parseLinksInput(input: unknown): LinksCommandInput {
    const args = readVaultToolArguments(input, 'links');
    const path = requiredNonEmptyString(args, 'path');
    const direction = optionalEnum(args, 'direction', [
        'outgoing',
        'backlinks',
        'both',
    ] as const) ?? 'both';
    const { offset, limit } = readPageArguments(args, LINKS_LIMITS);

    return {
        path,
        direction,
        offset,
        limit,
    };
}

export const linksTool = createCommandAdapter(parseLinksInput, linksCommand);
