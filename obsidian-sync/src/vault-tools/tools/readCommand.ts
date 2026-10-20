import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { READ_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { CommandError } from 'senaev-utils/src/commands/CommandError';

import {
    decodeText, hashBytes, MAX_FILE_BYTES, MAX_TEXT_BYTES, readFileBytes, resolveExistingFile,
} from '../access/vaultFiles';
import { normalizeVaultPath, isNotePath } from '../access/vaultAccess';
import { walkVault } from '../access/walkVault';
import { splitNote } from '../markdown/frontmatter';
import { findSection, formatHeadingPath } from '../markdown/sections';
import { getDiaryDate, isInDiaryRange } from '../noteScope';
import type { VaultToolsConfig } from '../vaultToolsConfig';

type ReadRequest = {
    path: string;
    section: string | undefined;
    startChar: number;
    lineNumbers: boolean;
};

/** The 1-based line number in `text` of the character at `index`. */
function lineNumberAt(text: string, index: number): number {
    let line = 1;

    for (let position = text.indexOf('\n'); position !== -1 && position < index; position = text.indexOf('\n', position + 1)) {
        line += 1;
    }

    return line;
}

/** "12: text" for every line; a final newline does not get a number of its own. */
function numberLines(text: string, firstLine: number): string {
    if (text === '') {
        return '';
    }

    const lines = text.split('\n');
    const hasFinalNewline = text.endsWith('\n');
    const numbered = (hasFinalNewline ? lines.slice(0, -1) : lines).map((line, index) => `${firstLine + index}: ${line}`);

    return `${numbered.join('\n')}${hasFinalNewline ? '\n' : ''}`;
}

async function readNote(config: VaultToolsConfig, request: ReadRequest, maxChars: number, execution: CommandExecution) {
    const absolutePath = await resolveExistingFile(config, request.path, execution);
    const data = await readFileBytes(absolutePath, execution);
    const isNote = isNotePath(config, request.path);

    if (!isNote && request.section !== undefined) {
        throw new CommandError('invalid_arguments', 'Sections are supported only for Markdown notes');
    }

    let raw: string;

    try {
        raw = decodeText(request.path, data, isNote ? MAX_FILE_BYTES : MAX_TEXT_BYTES);
    } catch (error) {
        if (!(error instanceof CommandError) || error.code !== 'binary_file') {
            throw error;
        }

        return {
            path: request.path,
            hash: hashBytes(data),
            size: data.length,
            binary: true,
            frontmatter: null,
            startChar: 0,
            totalChars: 0,
            content: '',
            truncated: false,
        };
    }

    const { body, ...frontmatter } = isNote
        ? splitNote(raw)
        : {
            body: raw,
            frontmatter: null,
        };

    const section = request.section === undefined ? null : findSection(raw, request.section);
    const fullText = section === null ? body : raw.slice(section.start, section.end);
    const text = fullText.slice(request.startChar);
    const sliced = text.slice(0, maxChars);
    const isTruncated = sliced.length < text.length;
    const contentStart = (section === null ? raw.length - body.length : section.start) + request.startChar;
    const content = request.lineNumbers ? numberLines(sliced, lineNumberAt(raw, contentStart)) : sliced;
    const diaryDate = getDiaryDate(config, request.path);

    return {
        path: request.path,
        ...diaryDate !== null && { diaryDate },
        // Always the hash of the whole file, also for a section or a truncated read.
        hash: hashBytes(data),
        size: data.length,
        binary: false,
        ...frontmatter,
        ...section !== null && {
            section: {
                headingPath: formatHeadingPath(section.headingPath),
                startLine: section.startLine,
                endLine: section.endLine,
            },
        },
        startChar: request.startChar,
        totalChars: fullText.length,
        content,
        truncated: isTruncated,
        ...isTruncated && { nextStartChar: request.startChar + sliced.length },
    };
}

export type ReadCommandInput = {
    paths: readonly string[] | undefined;
    diaryFrom: string | undefined;
    diaryTo: string | undefined;
    section: string | undefined;
    startChar: number;
    lineNumbers: boolean;
};

async function resolveRequestedPaths(config: VaultToolsConfig, input: ReadCommandInput, execution: CommandExecution) {
    if (input.paths !== undefined) {
        return {
            isDiaryRange: false,
            paths: input.paths.map((path) => normalizeVaultPath(path, 'paths')),
        };
    }

    const walk = await walkVault(config, config.diaryFolder, execution);

    return {
        isDiaryRange: true,
        paths: walk.files.filter((path) => isInDiaryRange(config, input, path)),
    };
}

/**
 * Reads whole notes until the response budget is used. Notes that did not fit are named
 * in the reply (`remainingPaths`, or `nextDiaryFrom` for a diary range), so the next call
 * continues exactly where this one stopped. Only a note larger than the per-note limit is
 * cut, and `truncated` says so.
 */
export async function readCommand(config: VaultToolsConfig, input: ReadCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const { isDiaryRange, paths } = await resolveRequestedPaths(config, input, execution);
    const {
        section, startChar, lineNumbers,
    } = input;
    const notes = [];
    const errors = [];
    let usedChars = 0;
    let stoppedAt = paths.length;

    for (const [
        index,
        path,
    ] of paths.entries()) {
        await execution.checkpoint();
        const budget = Math.min(READ_LIMITS.maxCharsPerNote, READ_LIMITS.maxCharsPerResponse - usedChars);

        if (budget <= 0) {
            stoppedAt = index;
            break;
        }

        try {
            const note = await readNote(config, {
                path,
                section,
                startChar,
                lineNumbers,
            }, READ_LIMITS.maxCharsPerNote, execution);

            // A note that would only fit cut is left whole for the next call, unless it is
            // the first one, which must always be returned so that reading makes progress.
            if (notes.length > 0 && note.content.length > budget) {
                stoppedAt = index;
                break;
            }

            notes.push(note);
            usedChars += note.content.length;
        } catch (error) {
            execution.throwIfAborted();
            if (!(error instanceof CommandError) || paths.length === 1) {
                throw error;
            }

            errors.push({
                path,
                code: error.code,
                message: error.message,
            });
        }
    }

    const remaining = paths.slice(stoppedAt);

    return {
        notes,
        errors,
        returnedChars: usedChars,
        limits: {
            maxCharsPerNote: READ_LIMITS.maxCharsPerNote,
            maxCharsPerResponse: READ_LIMITS.maxCharsPerResponse,
        },
        complete: remaining.length === 0,
        // A paths read continues with `remainingPaths`, a diary range read with `nextDiaryFrom`.
        remainingPaths: isDiaryRange ? null : remaining,
        nextDiaryFrom: isDiaryRange && remaining.length > 0 ? getDiaryDate(config, remaining[0] ?? '') : null,
    };
}

export type ReadCommandResult = Awaited<ReturnType<typeof readCommand>>;
