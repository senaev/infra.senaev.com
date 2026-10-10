import { MAX_GLOB_LENGTH, SEARCH_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    optionalBoolean,
    optionalCappedInteger,
    optionalInteger,
    optionalString,
    optionalStringArray,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath, readCodeToolArguments, resolveProject,
} from './projectAccess';

const RG_TIMEOUT_MS = 30_000;
const MAX_RG_OUTPUT_CHARS = 10_000_000;
const MAX_LINE_CHARS = 300;
const CHARS_BEFORE_MATCH = 100;
const MAX_FILE_SIZE = '1M';

type FoundLine = {
    line: number;
    text: string;
    isMatch: boolean;
};

type FileMatches = {
    path: string;
    lines: FoundLine[];
};

/** A long line is cut to a window that starts a little before the first match. */
function shortenLine(text: string, matchStart: number): string {
    if (text.length <= MAX_LINE_CHARS) {
        return text;
    }

    const start = Math.max(0, Math.min(matchStart - CHARS_BEFORE_MATCH, text.length - MAX_LINE_CHARS));

    return `${start > 0 ? '…' : ''}${text.slice(start, start + MAX_LINE_CHARS)}…`;
}

function readText(value: unknown): string | null {
    return isObject(value) && typeof value.text === 'string' ? value.text : null;
}

/** Groups ripgrep's `--json` events by file. Paths that are not valid UTF-8 are skipped. */
export function parseRipgrepJson(output: string): FileMatches[] {
    const files = new Map<string, FileMatches>();

    for (const line of output.split('\n')) {
        if (line === '') {
            continue;
        }

        let event: unknown;

        try {
            event = JSON.parse(line);
        } catch {
            // The last line is cut when the output is truncated.
            continue;
        }

        if (!isObject(event) || (event.type !== 'match' && event.type !== 'context') || !isObject(event.data)) {
            continue;
        }

        const { data } = event;
        const path = readText(data.path)?.replace(/^\.\//, '');
        const text = readText(data.lines)?.replace(/\r?\n$/, '');

        if (path === undefined || text === undefined || typeof data.line_number !== 'number') {
            continue;
        }

        const firstSubmatch = Array.isArray(data.submatches) ? data.submatches[0] : undefined;
        const matchStart = isObject(firstSubmatch) && typeof firstSubmatch.start === 'number' ? firstSubmatch.start : 0;
        const file = files.get(path) ?? {
            path,
            lines: [],
        };

        file.lines.push({
            line: data.line_number,
            text: shortenLine(text, matchStart),
            isMatch: event.type === 'match',
        });
        files.set(path, file);
    }

    return [...files.values()];
}

/**
 * The first `maxMatches` matching lines with their context, in ripgrep's own format:
 * "12:text" for a match, "13-text" for context, and "--" between separate parts.
 */
export function formatSnippet(lines: readonly FoundLine[], maxMatches: number, contextLines: number): string {
    const shownMatches = lines.filter((line) => line.isMatch).slice(0, maxMatches).map((line) => line.line);
    const isShown = (line: number) => shownMatches.some((match) => Math.abs(match - line) <= contextLines);
    const parts: string[] = [];
    let previousLine: number | null = null;

    for (const found of [...lines].sort((a, b) => a.line - b.line)) {
        if (!isShown(found.line) || found.line === previousLine) {
            continue;
        }

        if (previousLine !== null && found.line > previousLine + 1) {
            parts.push('--');
        }

        parts.push(`${found.line}${found.isMatch ? ':' : '-'}${found.text}`);
        previousLine = found.line;
    }

    return parts.join('\n');
}

function buildRipgrepArgs(options: {
    queries: readonly string[];
    regex: boolean;
    caseSensitive: boolean;
    contextLines: number;
    glob: string | undefined;
    folder: string;
}): string[] {
    return [
        '--json',
        '--no-config',
        // Dotfiles such as .github are code too; .gitignore still applies.
        '--hidden',
        '--glob',
        '!.git',
        ...options.regex ? [] : ['--fixed-strings'],
        options.caseSensitive ? '--case-sensitive' : '--ignore-case',
        '--context',
        String(options.contextLines),
        '--max-filesize',
        MAX_FILE_SIZE,
        ...options.glob === undefined
            ? []
            : [
                '--glob-case-insensitive',
                '--glob',
                options.glob,
            ],
        ...options.queries.flatMap((query) => [
            '-e',
            query,
        ]),
        '--',
        options.folder === '' ? '.' : options.folder,
    ];
}

export async function searchTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'search');
    const project = await resolveProject(config, args);
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
    const offset = optionalCappedInteger(args, 'offset', {
        min: 0,
        max: SEARCH_LIMITS.maxOffset,
    }) ?? 0;
    const limit = optionalCappedInteger(args, 'limit', {
        min: 1,
        max: SEARCH_LIMITS.maxLimit,
    }) ?? SEARCH_LIMITS.defaultLimit;

    const result = await runProcess('rg', buildRipgrepArgs({
        queries,
        regex: optionalBoolean(args, 'regex') ?? false,
        caseSensitive: optionalBoolean(args, 'caseSensitive') ?? false,
        contextLines,
        glob: optionalString(args, 'glob', MAX_GLOB_LENGTH),
        folder: normalizeProjectPath(optionalString(args, 'folder') ?? '', 'folder'),
    }), {
        cwd: project.root,
        timeoutMs: RG_TIMEOUT_MS,
        maxOutputChars: MAX_RG_OUTPUT_CHARS,
        keep: 'start',
        env: config.commandEnv,
    });
    const files = parseRipgrepJson(result.stdout).sort((a, b) => a.path.localeCompare(b.path));

    // Exit code 2 is an error, such as a bad regular expression or an unreadable file.
    if (result.exitCode === 2 && files.length === 0) {
        throw new ToolError('invalid_arguments', `ripgrep failed: ${result.stderr.trim().slice(0, 2000)}`);
    }

    const page = files.slice(offset, offset + limit);
    const countMatches = (file: FileMatches) => file.lines.filter((line) => line.isMatch).length;

    return {
        project: project.name,
        matchedFiles: files.length,
        totalMatches: files.reduce((sum, file) => sum + countMatches(file), 0),
        files: page.map((file) => {
            const matchCount = countMatches(file);

            return {
                path: file.path,
                matchCount,
                omittedMatches: Math.max(0, matchCount - maxMatchesPerFile),
                snippet: formatSnippet(file.lines, maxMatchesPerFile, contextLines),
            };
        }),
        nextOffset: offset + page.length < files.length ? offset + page.length : null,
        // The counts above are then only for the part that was read.
        truncated: result.outputTruncated || result.timedOut,
        ...result.exitCode === 2 && { warnings: result.stderr.trim().slice(0, 2000) },
    };
}
