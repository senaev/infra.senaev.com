import { posix } from 'node:path';

import picomatch from 'picomatch';

import { normalizeVaultPath } from './access/vaultAccess';
import {
    optionalIsoDay, optionalString, type ToolArguments,
} from './toolArguments';
import type { VaultToolsConfig } from './vaultToolsConfig';
import { invalidArguments } from './VaultToolError';

const DIARY_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.md$/;
const MAX_GLOB_LENGTH = 200;

/** Which files a list or search request covers. */
export type NoteScope = {
    folder: string;
    matchesGlob: ((path: string) => boolean) | null;
    diaryFrom: string | undefined;
    diaryTo: string | undefined;
};

export const NOTE_SCOPE_ARGUMENT_KEYS = [
    'folder',
    'glob',
    'diaryFrom',
    'diaryTo',
] as const;

/** `YYYY-MM-DD` for a diary entry, `null` for any other file. */
export function getDiaryDate(config: VaultToolsConfig, path: string): string | null {
    if (posix.dirname(path) !== config.diaryFolder) {
        return null;
    }

    return DIARY_FILE_NAME.exec(posix.basename(path))?.[1] ?? null;
}

export function isDiaryRangeRequested(scope: Pick<NoteScope, 'diaryFrom' | 'diaryTo'>): boolean {
    return scope.diaryFrom !== undefined || scope.diaryTo !== undefined;
}

export function readDiaryRange(args: ToolArguments): Pick<NoteScope, 'diaryFrom' | 'diaryTo'> {
    const diaryFrom = optionalIsoDay(args, 'diaryFrom');
    const diaryTo = optionalIsoDay(args, 'diaryTo');

    if (diaryFrom !== undefined && diaryTo !== undefined && diaryFrom > diaryTo) {
        throw invalidArguments('"diaryFrom" must not be later than "diaryTo"');
    }

    return {
        diaryFrom,
        diaryTo,
    };
}

export function readNoteScope(args: ToolArguments): NoteScope {
    const glob = optionalString(args, 'glob', MAX_GLOB_LENGTH);

    return {
        folder: normalizeVaultPath(optionalString(args, 'folder') ?? '', 'folder'),
        // Extglobs are off: they are the source of picomatch's known ReDoS cases, and a
        // file name filter does not need them. A pattern without `/` matches the file name;
        // `basename` is set only then, because it stops `a/**/*.md` from matching at all.
        matchesGlob: glob === undefined
            ? null
            : picomatch(glob, {
                basename: !glob.includes('/'),
                nocase: true,
                noextglob: true,
            }),
        ...readDiaryRange(args),
    };
}

export function isInDiaryRange(
    config: VaultToolsConfig,
    { diaryFrom, diaryTo }: Pick<NoteScope, 'diaryFrom' | 'diaryTo'>,
    path: string
): boolean {
    const date = getDiaryDate(config, path);

    return date !== null && (diaryFrom === undefined || date >= diaryFrom) && (diaryTo === undefined || date <= diaryTo);
}

/** Folder is already applied by the walk; this checks the file-level filters. */
export function matchesNoteScope(config: VaultToolsConfig, scope: NoteScope, path: string): boolean {
    if (scope.matchesGlob !== null && !scope.matchesGlob(path)) {
        return false;
    }

    return !isDiaryRangeRequested(scope) || isInDiaryRange(config, scope, path);
}
