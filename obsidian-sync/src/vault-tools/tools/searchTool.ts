import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

import { SEARCH_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { isNotePath } from '../access/vaultAccess';
import { type PathError, walkVault } from '../access/walkVault';
import {
    getDiaryDate,
    isDiaryRangeRequested,
    matchesNoteScope,
    readNoteScope,
} from '../noteScope';
import {
    optionalBoolean,
    optionalCappedInteger,
    optionalEnum,
    optionalInteger,
    optionalStringArray,
    readVaultToolArguments,
} from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';
import { invalidArguments } from '../VaultToolError';

const SNIPPET_MAX_CHARS = 300;
const SNIPPET_CHARS_BEFORE_MATCH = 100;
const MAX_REPORTED_ERRORS = 20;

type LineMatch = {
    line: number;
    text: string;
    queries: string[];
    before: string[];
    after: string[];
};

type FileMatch = {
    path: string;
    diaryDate?: string;
    matchedQueries: string[];
    titleMatched: boolean;
    hitCount: number;
    matches: LineMatch[];
    omittedMatches: number;
};

/** Only syntax characters may be escaped in a `u`-flag pattern, so `-` stays as it is. */
function escapeForRegExp(text: string): string {
    return text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

/**
 * Each query is a literal built into a pattern by us, never a pattern from the caller, so
 * there is no way to send a pattern that backtracks for ever.
 */
function compileQuery(query: string, isWholeWord: boolean): RegExp {
    const literal = escapeForRegExp(query);

    return new RegExp(isWholeWord ? `(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])` : literal, 'iu');
}

function shorten(line: string, matchIndex = 0): string {
    const text = line.replace(/\r$/, '');

    if (text.length <= SNIPPET_MAX_CHARS) {
        return text;
    }

    const start = Math.max(0, Math.min(matchIndex - SNIPPET_CHARS_BEFORE_MATCH, text.length - SNIPPET_MAX_CHARS));
    const end = start + SNIPPET_MAX_CHARS;

    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

type SearchOptions = {
    queries: string[];
    patterns: RegExp[];
    requireAll: boolean;
    contextLines: number;
    maxMatchesPerFile: number;
};

function searchNote(path: string, content: string, options: SearchOptions): FileMatch | null {
    const title = posix.basename(path, '.md');
    const matchedQueryIndexes = new Set<number>();
    const titleMatches = options.patterns.flatMap((pattern, index) => (pattern.test(title) ? [index] : []));

    titleMatches.forEach((index) => matchedQueryIndexes.add(index));

    const lines = content.split('\n');
    const matches: LineMatch[] = [];
    let hitCount = 0;

    lines.forEach((line, lineIndex) => {
        const lineQueries = options.patterns.flatMap((pattern, index) => (pattern.test(line) ? [index] : []));

        if (lineQueries.length === 0) {
            return;
        }

        hitCount += 1;
        lineQueries.forEach((index) => matchedQueryIndexes.add(index));

        if (matches.length >= options.maxMatchesPerFile) {
            return;
        }

        const firstQueryIndex = lineQueries[0] ?? 0;
        const matchIndex = options.patterns[firstQueryIndex]?.exec(line)?.index ?? 0;

        matches.push({
            line: lineIndex + 1,
            text: shorten(line, matchIndex),
            queries: lineQueries.map((index) => options.queries[index] ?? ''),
            before: lines.slice(Math.max(0, lineIndex - options.contextLines), lineIndex).map((context) => shorten(context)),
            after: lines.slice(lineIndex + 1, lineIndex + 1 + options.contextLines).map((context) => shorten(context)),
        });
    });

    const isMatch = options.requireAll
        ? matchedQueryIndexes.size === options.queries.length
        : matchedQueryIndexes.size > 0;

    if (!isMatch) {
        return null;
    }

    return {
        path,
        matchedQueries: options.queries.filter((_query, index) => matchedQueryIndexes.has(index)),
        titleMatched: titleMatches.length > 0,
        hitCount,
        matches,
        omittedMatches: hitCount - matches.length,
    };
}

function byRelevance(a: FileMatch, b: FileMatch): number {
    return b.matchedQueries.length - a.matchedQueries.length || Number(b.titleMatched) - Number(a.titleMatched) || b.hitCount - a.hitCount || a.path.localeCompare(b.path);
}

/**
 * Searches the text of every note in scope in one pass. The whole scope is always scanned,
 * also when the response limit is reached early, so the totals are exact.
 */
export async function searchTool(config: VaultToolsConfig, input: unknown) {
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
    const options: SearchOptions = {
        queries,
        patterns: queries.map((query) => compileQuery(query, isWholeWord)),
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
    const offset = optionalCappedInteger(args, 'offset', {
        min: 0,
        max: SEARCH_LIMITS.maxOffset,
    }) ?? 0;
    const limit = optionalCappedInteger(args, 'limit', {
        min: 1,
        max: SEARCH_LIMITS.maxLimit,
    }) ?? SEARCH_LIMITS.defaultLimit;

    const walk = await walkVault(config, scope.folder);
    const paths = walk.files.filter((path) => isNotePath(config, path) && matchesNoteScope(config, scope, path));
    const fileMatches: FileMatch[] = [];
    const readErrors: PathError[] = [];

    for (const path of paths) {
        let content: string;

        try {
            content = await readFile(join(config.root, path), 'utf8');
        } catch (error) {
            readErrors.push({
                path,
                message: stringifyUnknownError(error),
            });
            continue;
        }

        const fileMatch = searchNote(path, content, options);
        const diaryDate = getDiaryDate(config, path);

        if (fileMatch !== null) {
            fileMatches.push(diaryDate === null
                ? fileMatch
                : {
                    ...fileMatch,
                    diaryDate,
                });
        }
    }

    if (sort === 'relevance') {
        fileMatches.sort(byRelevance);
    }

    const page = fileMatches.slice(offset, offset + limit);
    const nextOffset = offset + page.length < fileMatches.length ? offset + page.length : null;

    return {
        queries,
        match: options.requireAll ? 'all' : 'any',
        sort,
        scannedFiles: paths.length,
        matchedFiles: fileMatches.length,
        totalHits: fileMatches.reduce((sum, file) => sum + file.hitCount, 0),
        offset,
        limit,
        nextOffset,
        truncated: nextOffset !== null || page.some((file) => file.omittedMatches > 0),
        complete: walk.errors.length === 0 && readErrors.length === 0,
        readErrorCount: readErrors.length,
        readErrors: readErrors.slice(0, MAX_REPORTED_ERRORS),
        walkErrors: walk.errors.slice(0, MAX_REPORTED_ERRORS),
        files: page,
    };
}
