import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { isNotePath } from '../access/vaultAccess';
import {
    type FolderEntry, listFolder, walkVault,
} from '../access/walkVault';
import {
    getDiaryDate,
    isDiaryRangeRequested,
    matchesNoteScope,
    NOTE_SCOPE_ARGUMENT_KEYS,
    readNoteScope,
} from '../noteScope';
import {
    optionalBoolean, optionalInteger, readToolArguments,
} from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

const DEFAULT_ENTRIES = 100;
const MAX_ENTRIES = 200;
const MAX_OFFSET = 1_000_000;

async function describeEntry(config: VaultToolsConfig, entry: FolderEntry) {
    if (entry.type === 'folder') {
        return entry;
    }

    const stats = await stat(join(config.root, entry.path)).catch(() => null);
    const diaryDate = getDiaryDate(config, entry.path);

    return {
        ...entry,
        ...diaryDate !== null && { diaryDate },
        ...stats !== null && {
            size: stats.size,
            modified: stats.mtime.toISOString(),
        },
    };
}

/**
 * Lists notes and folders. Without filters it shows one folder level, like a file
 * explorer; with `recursive`, a glob or a diary range it lists matching notes at any depth.
 */
export async function listTool(config: VaultToolsConfig, input: unknown) {
    const args = readToolArguments(input, [
        ...NOTE_SCOPE_ARGUMENT_KEYS,
        'recursive',
        'offset',
        'limit',
    ]);
    const scope = readNoteScope(args);
    const offset = optionalInteger(args, 'offset', {
        min: 0,
        max: MAX_OFFSET,
    }) ?? 0;
    const limit = optionalInteger(args, 'limit', {
        min: 1,
        max: MAX_ENTRIES,
    }) ?? DEFAULT_ENTRIES;
    const isRecursive = optionalBoolean(args, 'recursive') === true || scope.matchesGlob !== null || isDiaryRangeRequested(scope);

    let entries: FolderEntry[];
    let walkErrors: { path: string; message: string }[] = [];

    if (isRecursive) {
        const walk = await walkVault(config, scope.folder);

        entries = walk.files
            .filter((path) => isNotePath(config, path) && matchesNoteScope(config, scope, path))
            .map((path) => {
                return {
                    path,
                    type: 'file',
                };
            });
        walkErrors = walk.errors;
    } else {
        entries = (await listFolder(config, scope.folder))
            .filter((entry) => entry.type === 'folder' || isNotePath(config, entry.path));
    }

    const page = entries.slice(offset, offset + limit);
    const nextOffset = offset + page.length < entries.length ? offset + page.length : null;

    return {
        folder: scope.folder,
        recursive: isRecursive,
        total: entries.length,
        offset,
        nextOffset,
        entries: await Promise.all(page.map((entry) => describeEntry(config, entry))),
        complete: walkErrors.length === 0,
        walkErrors,
    };
}
