import { MAX_GLOB_LENGTH } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { compileFileGlob } from 'senaev-utils/src/files/compileFileGlob';
import { optionalString, type ToolArguments } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { normalizeVaultPath } from './access/vaultAccess';
import { optionalIsoDay } from './toolArguments';
import type { NoteScope } from './noteScope';

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
        matchesGlob: glob === undefined ? null : compileFileGlob(glob),
        ...readDiaryRange(args),
    };
}
