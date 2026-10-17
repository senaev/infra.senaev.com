import { SEARCH_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import {
    optionalBoolean, optionalEnum, optionalStringArray, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';

/** Only syntax characters may be escaped in a `u`-flag pattern, so `-` stays as it is. */
function escapeForRegExp(text: string): string {
    return text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

/**
 * Each query is a literal built into a pattern by us, never a pattern from the caller, so
 * there is no way to send a pattern that backtracks for ever.
 */
export function compileTextQuery(query: string, isWholeWord: boolean): RegExp {
    const literal = escapeForRegExp(query);

    return new RegExp(isWholeWord ? `(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])` : literal, 'iu');
}

/** The `queries`, `match` and `wholeWord` arguments shared by obsidian-search and obsidian-tasks_list. */
export type TextQuery = {
    queries: string[];
    requireAll: boolean;
    wholeWord: boolean;
};

export function readTextQuery(args: ToolArguments): TextQuery | undefined {
    const queries = optionalStringArray(args, 'queries', {
        maxItems: SEARCH_LIMITS.maxQueries,
        maxLength: SEARCH_LIMITS.maxQueryLength,
    });

    if (queries === undefined) {
        return undefined;
    }

    return {
        queries,
        requireAll: optionalEnum(args, 'match', [
            'any',
            'all',
        ] as const) === 'all',
        wholeWord: optionalBoolean(args, 'wholeWord') === true,
    };
}

/** Whether one text matches the query: any or all of the queries occur in it. */
export function createTextMatcher({
    queries, requireAll, wholeWord,
}: TextQuery): (text: string) => boolean {
    const patterns = queries.map((query) => compileTextQuery(query, wholeWord));

    return (text) => (requireAll ? patterns.every((pattern) => pattern.test(text)) : patterns.some((pattern) => pattern.test(text)));
}
