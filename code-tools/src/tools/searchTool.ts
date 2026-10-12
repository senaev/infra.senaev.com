import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { MAX_GLOB_LENGTH, SEARCH_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    optionalBoolean, readPageArguments, optionalInteger, optionalString, optionalStringArray, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { readCodeToolArguments } from './toolArguments';
import { type SearchCommandInput, searchCommand } from './searchCommand';

function parseSearchInput(input: unknown): SearchCommandInput {
    const args = readCodeToolArguments(input, 'search');
    const queries = optionalStringArray(args, 'queries', {
        maxItems: SEARCH_LIMITS.maxQueries,
        maxLength: SEARCH_LIMITS.maxQueryLength,
    });

    if (queries === undefined) {
        throw invalidArguments('"queries" is required');
    }

    const contextLines = optionalInteger(args, 'contextLines', {
        min: 0,
        max: SEARCH_LIMITS.maxContextLines,
    }) ?? SEARCH_LIMITS.defaultContextLines;
    const maxMatchesPerFile = optionalInteger(args, 'maxMatchesPerFile', {
        min: 1,
        max: SEARCH_LIMITS.maxMatchesPerFile,
    }) ?? SEARCH_LIMITS.defaultMatchesPerFile;
    const { offset, limit } = readPageArguments(args, SEARCH_LIMITS);

    return {
        project: requiredNonEmptyString(args, 'project'),
        queries,
        regex: optionalBoolean(args, 'regex') ?? false,
        caseSensitive: optionalBoolean(args, 'caseSensitive') ?? false,
        contextLines,
        glob: optionalString(args, 'glob', MAX_GLOB_LENGTH),
        folder: optionalString(args, 'folder') ?? '',
        maxMatchesPerFile,
        offset,
        limit,
    };
}

export const searchTool = createCommandAdapter(parseSearchInput, searchCommand);
