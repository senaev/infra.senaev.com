import { posix } from 'node:path';

import type { VaultToolsConfig } from './vaultToolsConfig';

const DIARY_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.md$/;

/** Which files a list or search request covers. */
export type NoteScope = {
    folder: string;
    matchesGlob: ((path: string) => boolean) | null;
    diaryFrom: string | undefined;
    diaryTo: string | undefined;
};

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
