import { readdir, stat } from 'node:fs/promises';
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

async function isFolder(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Everything directly in the folder except .git, like `ls -A`: also ignored entries such as
 * node_modules, empty folders and symbolic links, which are typed by their target. Folders first.
 */
async function listOneLevel(folder: string, execution: CommandExecution): Promise<Entry[]> {
    await execution.checkpoint();
    const dirents = await readdir(folder, { withFileTypes: true });
    const folders: string[] = [];
    const files: string[] = [];

    for (const dirent of dirents) {
        await execution.checkpoint();
        if (dirent.name === '.git') {
            continue;
        }

        const isFolderEntry = dirent.isDirectory() || (dirent.isSymbolicLink() && await isFolder(posix.join(folder, dirent.name)));

        (isFolderEntry ? folders : files).push(dirent.name);
    }

    return [
        ...folders.sort().map((path): Entry => {
            return {
                path,
                type: 'folder',
            };
        }),
        ...files.sort().map((path): Entry => {
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
            size: (await stat(path)).size,
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
    const matchesGlob = glob === undefined ? null : compileFileGlob(glob);
    let entries: Entry[] = [];
    let warnings: string | undefined;

    if (recursive || matchesGlob !== null) {
        const listed = await listFiles(config, folder, execution);
        const { files } = listed;

        warnings = listed.warnings;
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
        entries = await listOneLevel(folder, execution);
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
        ...warnings !== undefined && { warnings },
    };
}

export type ListCommandResult = Awaited<ReturnType<typeof listCommand>>;
