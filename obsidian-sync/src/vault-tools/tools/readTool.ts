import { readFile } from 'node:fs/promises';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { walkVault } from '../access/walkVault';
import { splitNote } from '../markdown/frontmatter';
import { hashContent } from '../markdown/parseMarkdown';
import { findSection, formatHeadingPath } from '../markdown/sections';
import {
    getDiaryDate, isDiaryRangeRequested, isInDiaryRange, readDiaryRange,
} from '../noteScope';
import {
    optionalInteger, optionalString, optionalStringArray, readToolArguments,
} from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';
import { invalidArguments, VaultToolError } from '../VaultToolError';

const MAX_PATHS = 50;
const MAX_CHARS_PER_NOTE = 20_000;
const MAX_CHARS_PER_RESPONSE = 30_000;

type ReadRequest = {
    path: string;
    section: string | undefined;
    startChar: number;
};

async function readNote(config: VaultToolsConfig, request: ReadRequest, maxChars: number) {
    const absolutePath = await resolveExistingNote(config, request.path);
    const raw = await readFile(absolutePath, 'utf8');
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

async function resolveRequestedPaths(config: VaultToolsConfig, args: Record<string, unknown>) {
    const paths = optionalStringArray(args, 'paths', { maxItems: MAX_PATHS });
    const range = readDiaryRange(args);

    if ((paths === undefined) === !isDiaryRangeRequested(range)) {
        throw invalidArguments('Give either "paths" or a diary range ("diaryFrom"/"diaryTo"), not both and not neither');
    }

    if (paths !== undefined) {
        return {
            isDiaryRange: false,
            paths: paths.map((path) => normalizeVaultPath(path, 'paths')),
        };
    }

    const walk = await walkVault(config, config.diaryFolder);

    return {
        isDiaryRange: true,
        paths: walk.files.filter((path) => isInDiaryRange(config, range, path)),
    };
}

/**
 * Reads whole notes until the response budget is used. Notes that did not fit are named
 * in the reply (`remainingPaths`, or `nextDiaryFrom` for a diary range), so the next call
 * continues exactly where this one stopped. Only a note larger than the per-note limit is
 * cut, and `truncated` says so.
 */
export async function readTool(config: VaultToolsConfig, input: unknown) {
    const args = readToolArguments(input, [
        'paths',
        'diaryFrom',
        'diaryTo',
        'section',
        'startChar',
    ]);
    const { isDiaryRange, paths } = await resolveRequestedPaths(config, args);
    const section = optionalString(args, 'section');
    const startChar = optionalInteger(args, 'startChar', {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
    }) ?? 0;

    if ((section !== undefined || startChar > 0) && (isDiaryRange || paths.length !== 1)) {
        throw invalidArguments('"section" and "startChar" can only be used when reading exactly one path');
    }

    const notes = [];
    const errors = [];
    let usedChars = 0;
    let stoppedAt = paths.length;

    for (const [
        index,
        path,
    ] of paths.entries()) {
        const budget = Math.min(MAX_CHARS_PER_NOTE, MAX_CHARS_PER_RESPONSE - usedChars);

        if (budget <= 0) {
            stoppedAt = index;
            break;
        }

        try {
            const note = await readNote(config, {
                path,
                section,
                startChar,
            }, MAX_CHARS_PER_NOTE);

            // A note that would only fit cut is left whole for the next call, unless it is
            // the first one, which must always be returned so that reading makes progress.
            if (notes.length > 0 && note.content.length > budget) {
                stoppedAt = index;
                break;
            }

            notes.push(note);
            usedChars += note.content.length;
        } catch (error) {
            if (!(error instanceof VaultToolError) || paths.length === 1) {
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
            maxCharsPerNote: MAX_CHARS_PER_NOTE,
            maxCharsPerResponse: MAX_CHARS_PER_RESPONSE,
        },
        complete: remaining.length === 0,
        // A paths read continues with `remainingPaths`, a diary range read with `nextDiaryFrom`.
        remainingPaths: isDiaryRange ? null : remaining,
        nextDiaryFrom: isDiaryRange && remaining.length > 0 ? getDiaryDate(config, remaining[0] ?? '') : null,
    };
}
