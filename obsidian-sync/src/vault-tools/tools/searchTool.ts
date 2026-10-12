import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { SEARCH_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import {
    optionalBoolean, readPageArguments, optionalEnum, optionalInteger, optionalStringArray,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { isDiaryRangeRequested } from '../noteScope';
import { readNoteScope } from '../noteScopeArguments';
import { readVaultToolArguments } from '../toolArguments';

import { type SearchCommandInput, searchCommand } from './searchCommand';

function parseSearchInput(input: unknown): SearchCommandInput {
    const args = readVaultToolArguments(input, 'search');
    const queries = optionalStringArray(args, 'queries', {
        maxItems: SEARCH_LIMITS.maxQueries,
        maxLength: SEARCH_LIMITS.maxQueryLength,
    });

    if (queries === undefined) {
        throw invalidArguments('"queries" is required');
    }

    const scope = readNoteScope(args);
    const isWholeWord = optionalBoolean(args, 'wholeWord') === true;
    const options = {
        queries,
        requireAll: optionalEnum(args, 'match', [
            'any',
            'all',
        ] as const) === 'all',
        contextLines: optionalInteger(args, 'contextLines', {
            min: 0,
            max: SEARCH_LIMITS.maxContextLines,
        }) ?? SEARCH_LIMITS.defaultContextLines,
        maxMatchesPerFile: optionalInteger(args, 'maxMatchesPerFile', {
            min: 1,
            max: SEARCH_LIMITS.maxMatchesPerFile,
        }) ?? SEARCH_LIMITS.defaultMatchesPerFile,
    };
    const sort = optionalEnum(args, 'sort', [
        'relevance',
        'path',
    ] as const) ?? (isDiaryRangeRequested(scope) ? 'path' : 'relevance');
    const { offset, limit } = readPageArguments(args, SEARCH_LIMITS);

    return {
        scope,
        ...options,
        wholeWord: isWholeWord,
        sort,
        offset,
        limit,
    };
}

export const searchTool = createCommandAdapter(parseSearchInput, searchCommand);
