import { lstat } from 'node:fs/promises';
import { posix } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { compileFileGlob } from 'senaev-utils/src/files/compileFileGlob';

import type { CodeToolsConfig } from './codeToolsConfig';
import { assertExistingFolder, normalizeAbsolutePath } from './fileAccess';
import { listFiles } from './listFiles';

type Entry = {
    path: string;
    type: 'file' | 'folder';
};

/** The files and folders directly in the listed folder, folders first; paths stay relative. */
async function listOneLevel(files: readonly string[], execution: CommandExecution): Promise<Entry[]> {
    const folders = new Set<string>();
    const directFiles: string[] = [];

    let index = 0;

    for (const file of files) {
        if (index++ % 128 === 0) {
            await execution.checkpoint();
        }

        const slash = file.indexOf('/');

        if (slash === -1) {
            directFiles.push(file);
        } else {
            folders.add(file.slice(0, slash));
        }
    }

    return [
        ...[...folders].sort().map((path): Entry => {
            return {
                path,
                type: 'folder',
            };
        }),
        ...directFiles.map((path): Entry => {
            return {
                path,
                type: 'file',
            };
        }),
    ];
}

/** The entry with an absolute path, and with its size if it is a file. */
async function toResultEntry(folder: string, entry: Entry, execution: CommandExecution) {
    await execution.checkpoint();
    const path = posix.join(folder, entry.path);

    if (entry.type === 'folder') {
        return {
            path,
            type: entry.type,
        };
    }

    try {
        return {
            path,
            type: entry.type,
            size: (await lstat(path)).size,
        };
    } catch {
        execution.throwIfAborted();

        return {
            path,
            type: entry.type,
        };
    }
}

export type ListCommandInput = {
    folder: string; glob: string | undefined; recursive: boolean; offset: number; limit: number;
};

export async function listCommand(config: CodeToolsConfig, input: ListCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const folder = normalizeAbsolutePath(input.folder, 'folder');
    const {
        glob, recursive, offset, limit,
    } = input;

    await assertExistingFolder(folder, execution);
    const files = await listFiles(config, folder, execution);
    const matchesGlob = glob === undefined ? null : compileFileGlob(glob);
    let entries: Entry[] = [];

    if (recursive || matchesGlob !== null) {
        for (let index = 0; index < files.length; index++) {
            if (index % 128 === 0) {
                await execution.checkpoint();
            }

            const path = files[index];

            if (path !== undefined && (matchesGlob === null || matchesGlob(path))) {
                entries.push({
                    path,
                    type: 'file',
                });
            }
        }
    } else {
        entries = await listOneLevel(files, execution);
    }

    const page = entries.slice(offset, offset + limit);
    const nextOffset = offset + page.length < entries.length ? offset + page.length : null;

    const resultEntries = [];

    for (const entry of page) {
        resultEntries.push(await toResultEntry(folder, entry, execution));
    }

    execution.throwIfAborted();

    return {
        folder,
        total: entries.length,
        entries: resultEntries,
        nextOffset,
    };
}

export type ListCommandResult = Awaited<ReturnType<typeof listCommand>>;
