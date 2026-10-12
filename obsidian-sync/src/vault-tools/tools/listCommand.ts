import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { isNotePath } from '../access/vaultAccess';
import {
    type FolderEntry, listFolder, walkVault,
} from '../access/walkVault';
import {
    getDiaryDate, isDiaryRangeRequested, matchesNoteScope, type NoteScope,
} from '../noteScope';
import type { VaultToolsConfig } from '../vaultToolsConfig';

async function describeEntry(config: VaultToolsConfig, entry: FolderEntry, execution: CommandExecution) {
    await execution.checkpoint();
    if (entry.type === 'folder') {
        return entry;
    }

    const stats = await stat(join(config.root, entry.path)).catch(() => {
        execution.throwIfAborted();

        return null;
    });
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

export type ListCommandInput = {
    scope: NoteScope;
    recursive: boolean;
    offset: number;
    limit: number;
};

/**
 * Lists notes and folders. Without filters it shows one folder level, like a file
 * explorer; with `recursive`, a glob or a diary range it lists matching notes at any depth.
 */
export async function listCommand(config: VaultToolsConfig, input: ListCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const {
        scope, recursive, offset, limit,
    } = input;
    const isRecursive = recursive || scope.matchesGlob !== null || isDiaryRangeRequested(scope);
    let entries: FolderEntry[];
    let walkErrors: { path: string; message: string }[] = [];

    if (isRecursive) {
        const walk = await walkVault(config, scope.folder, execution);

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
        entries = (await listFolder(config, scope.folder, execution))
            .filter((entry) => entry.type === 'folder' || isNotePath(config, entry.path));
    }

    const page = entries.slice(offset, offset + limit);
    const nextOffset = offset + page.length < entries.length ? offset + page.length : null;

    const describedEntries = [];

    for (const entry of page) {
        describedEntries.push(await describeEntry(config, entry, execution));
    }

    execution.throwIfAborted();

    return {
        folder: scope.folder,
        recursive: isRecursive,
        total: entries.length,
        offset,
        limit,
        nextOffset,
        entries: describedEntries,
        complete: walkErrors.length === 0,
        walkErrors,
    };
}

export type ListCommandResult = Awaited<ReturnType<typeof listCommand>>;
