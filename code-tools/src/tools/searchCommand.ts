import { SECURE_FILESYSTEM_HELPER } from 'senaev-utils/src/files/secureFilesystem/runSecureFilesystem';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    assertExistingPathHasNoSymlink, normalizeProjectPath, resolveNamedProject,
} from './projectAccess';

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
export async function parseRipgrepJson(output: string, execution: CommandExecution): Promise<FileMatches[]> {
    const files = new Map<string, FileMatches>();

    let index = 0;

    for (const line of output.split('\n')) {
        if (index++ % 128 === 0) {
            await execution.checkpoint();
        }

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

    execution.throwIfAborted();

    return [...files.values()];
}

/**
 * The first `maxMatches` matching lines with their context, in ripgrep's own format:
 * "12:text" for a match, "13-text" for context, and "--" between separate parts.
 */
export async function formatSnippet(lines: readonly FoundLine[], maxMatches: number, contextLines: number, execution: CommandExecution): Promise<string> {
    const shownMatches: number[] = [];
    let index = 0;

    for (const line of lines) {
        if (index++ % 128 === 0) {
            await execution.checkpoint();
        }

        if (line.isMatch) {
            shownMatches.push(line.line);
            if (shownMatches.length === maxMatches) {
                break;
            }
        }
    }

    const isShown = (line: number) => shownMatches.some((match) => Math.abs(match - line) <= contextLines);
    const parts: string[] = [];
    let previousLine: number | null = null;

    await execution.checkpoint();
    for (const found of [...lines].sort((a, b) => a.line - b.line)) {
        if (index++ % 128 === 0) {
            await execution.checkpoint();
        }

        if (!isShown(found.line) || found.line === previousLine) {
            continue;
        }

        if (previousLine !== null && found.line > previousLine + 1) {
            parts.push('--');
        }

        parts.push(`${found.line}${found.isMatch ? ':' : '-'}${found.text}`);
        previousLine = found.line;
    }

    execution.throwIfAborted();

    return parts.join('\n');
}

function buildRipgrepArgs(options: {
    queries: readonly string[];
    regex: boolean;
    caseSensitive: boolean;
    contextLines: number;
    glob: string | undefined;
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
        '.',
    ];
}

export type SearchCommandInput = {
    project: string; queries: readonly string[]; regex: boolean; caseSensitive: boolean; contextLines: number;
    glob: string | undefined; folder: string; maxMatchesPerFile: number; offset: number; limit: number;
};

export async function searchCommand(config: CodeToolsConfig, input: SearchCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const project = await resolveNamedProject(config, input.project, execution);
    const {
        contextLines, maxMatchesPerFile, offset, limit,
    } = input;
    const folder = normalizeProjectPath(input.folder, 'folder');

    await assertExistingPathHasNoSymlink(project, folder, execution);
    // The launcher opens the project without following symlinks and fchdir pins that
    // directory before exec. Replacing its pathname cannot redirect the search root.
    // Folder filtering remains below; this launcher never copies the repository.
    const result = await runProcess('python3', [
        SECURE_FILESYSTEM_HELPER,
        '--search',
        config.projectsRoot,
        project.name,
        JSON.stringify([
            'rg',
            ...buildRipgrepArgs(input),
        ]),
    ], {
        cwd: project.root,
        signal: execution.signal,
        onOutput: execution.log,
        maxOutputChars: MAX_RG_OUTPUT_CHARS,
        keep: 'start',
        env: config.commandEnv,
    });

    execution.throwIfAborted();
    if (result.exitCode === 77) {
        throw new CommandError('forbidden_path', 'Project directory changed before search');
    }

    const isInFolder = (path: string) => folder === '' || path === folder || path.startsWith(`${folder}/`);
    const files = (await parseRipgrepJson(result.stdout, execution))
        .filter((file) => isInFolder(file.path))
        .sort((a, b) => a.path.localeCompare(b.path));

    // Exit code 2 is an error, such as a bad regular expression or an unreadable file.
    if (result.exitCode === 2 && files.length === 0) {
        throw new CommandError('invalid_arguments', `ripgrep failed: ${result.stderr.trim().slice(0, 2000)}`);
    }

    const page = files.slice(offset, offset + limit);
    const counts = new Map<FileMatches, number>();
    let totalMatches = 0;
    let index = 0;

    for (const file of files) {
        let count = 0;

        for (const line of file.lines) {
            if (index++ % 128 === 0) {
                await execution.checkpoint();
            }

            if (line.isMatch) {
                count++;
            }
        }

        counts.set(file, count);
        totalMatches += count;
    }

    const snippets = [];

    for (const file of page) {
        const matchCount = counts.get(file) ?? 0;

        snippets.push({
            path: file.path,
            matchCount,
            omittedMatches: Math.max(0, matchCount - maxMatchesPerFile),
            snippet: await formatSnippet(file.lines, maxMatchesPerFile, contextLines, execution),
        });
    }

    execution.throwIfAborted();

    return {
        project: project.name,
        matchedFiles: files.length,
        totalMatches,
        files: snippets,
        nextOffset: offset + page.length < files.length ? offset + page.length : null,
        // The counts above are then only for the part that was read.
        truncated: result.outputTruncated || result.timedOut,
        ...result.exitCode === 2 && { warnings: result.stderr.trim().slice(0, 2000) },
    };
}

export type SearchCommandResult = Awaited<ReturnType<typeof searchCommand>>;
