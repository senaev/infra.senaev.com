import { join, posix } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { isNotePath } from '../access/vaultAccess';
import { type PathError, walkVault } from '../access/walkVault';
import {
    getDiaryDate, matchesNoteScope, type NoteScope,
} from '../noteScope';
import { compileTextQuery } from '../textQuery';
import type { VaultToolsConfig } from '../vaultToolsConfig';

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

async function searchNote(path: string, content: string, options: SearchOptions, execution: CommandExecution): Promise<FileMatch | null> {
    const title = posix.basename(path, '.md');
    const matchedQueryIndexes = new Set<number>();
    const titleMatches = options.patterns.flatMap((pattern, index) => (pattern.test(title) ? [index] : []));

    titleMatches.forEach((index) => matchedQueryIndexes.add(index));

    const lines = content.split('\n');
    const matches: LineMatch[] = [];
    let hitCount = 0;

    for (const [
        lineIndex,
        line,
    ] of lines.entries()) {
        if (lineIndex % 128 === 0) {
            await execution.checkpoint();
        }

        const lineQueries = options.patterns.flatMap((pattern, index) => (pattern.test(line) ? [index] : []));

        if (lineQueries.length === 0) {
            continue;
        }

        hitCount += 1;
        lineQueries.forEach((index) => matchedQueryIndexes.add(index));

        if (matches.length >= options.maxMatchesPerFile) {
            continue;
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
    }

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

export type SearchCommandInput = {
    scope: NoteScope;
    queries: string[];
    wholeWord: boolean;
    requireAll: boolean;
    contextLines: number;
    maxMatchesPerFile: number;
    sort: 'relevance' | 'path';
    offset: number;
    limit: number;
};

/**
 * Searches the text of every note in scope in one pass. The whole scope is always scanned,
 * also when the response limit is reached early, so the totals are exact.
 */
export async function searchCommand(config: VaultToolsConfig, input: SearchCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const {
        scope, queries, sort, offset, limit,
    } = input;
    const options: SearchOptions = {
        ...input,
        patterns: queries.map((query) => compileTextQuery(query, input.wholeWord)),
    };
    const walk = await walkVault(config, scope.folder, execution);
    const paths = walk.files.filter((path) => isNotePath(config, path) && matchesNoteScope(config, scope, path));
    const fileMatches: FileMatch[] = [];
    const readErrors: PathError[] = [];

    for (const path of paths) {
        await execution.checkpoint();
        let content: string;

        try {
            content = await readTextFile(join(config.root, path), execution);
        } catch (error) {
            execution.throwIfAborted();
            readErrors.push({
                path,
                message: stringifyUnknownError(error),
            });
            continue;
        }

        const fileMatch = await searchNote(path, content, options, execution);
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

export type SearchCommandResult = Awaited<ReturnType<typeof searchCommand>>;
