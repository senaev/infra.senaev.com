import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { READ_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import { CommandError } from 'senaev-utils/src/commands/CommandError';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { walkVault } from '../access/walkVault';
import { splitNote } from '../markdown/frontmatter';
import { findSection, formatHeadingPath } from '../markdown/sections';
import { getDiaryDate, isInDiaryRange } from '../noteScope';
import type { VaultToolsConfig } from '../vaultToolsConfig';

type ReadRequest = {
    path: string;
    section: string | undefined;
    startChar: number;
};

async function readNote(config: VaultToolsConfig, request: ReadRequest, maxChars: number, execution: CommandExecution) {
    const absolutePath = await resolveExistingNote(config, request.path, execution);
    const raw = await readTextFile(absolutePath, execution);
    const { body, ...frontmatter } = splitNote(raw);
    const section = request.section === undefined ? null : findSection(raw, request.section);
    const fullText = section === null ? body : raw.slice(section.start, section.end);
    const text = fullText.slice(request.startChar);
    const content = text.slice(0, maxChars);
    const isTruncated = content.length < text.length;
    const diaryDate = getDiaryDate(config, request.path);

    return {
        path: request.path,
        ...diaryDate !== null && { diaryDate },
        // Always the hash of the whole file, also for a section or a truncated read.
        hash: hashContent(raw),
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
        ...isTruncated && { nextStartChar: request.startChar + content.length },
    };
}

export type ReadCommandInput = {
    paths: readonly string[] | undefined;
    diaryFrom: string | undefined;
    diaryTo: string | undefined;
    section: string | undefined;
    startChar: number;
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
    const { section, startChar } = input;
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
