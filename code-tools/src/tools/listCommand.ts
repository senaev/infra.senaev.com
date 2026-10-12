import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { compileFileGlob } from 'senaev-utils/src/files/compileFileGlob';
import { CommandError } from 'senaev-utils/src/commands/CommandError';

import { listProjectFiles } from '../git/runGit';

import type { CodeToolsConfig } from './codeToolsConfig';
import { normalizeProjectPath, resolveNamedProject } from './projectAccess';

type Entry = {
    path: string;
    type: 'file' | 'folder';
};

/** The files and folders directly in `folder`, folders first. */
async function listOneLevel(files: readonly string[], folder: string, execution: CommandExecution): Promise<Entry[]> {
    const prefix = folder === '' ? '' : `${folder}/`;
    const folders = new Set<string>();
    const directFiles: string[] = [];

    let index = 0;

    for (const file of files) {
        if (index++ % 128 === 0) {
            await execution.checkpoint();
        }

        const rest = file.slice(prefix.length);
        const slash = rest.indexOf('/');

        if (slash === -1) {
            directFiles.push(file);
        } else {
            folders.add(`${prefix}${rest.slice(0, slash)}`);
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

async function withSize(root: string, entry: Entry, execution: CommandExecution) {
    await execution.checkpoint();
    if (entry.type === 'folder') {
        return entry;
    }

    try {
        return {
            ...entry,
            size: (await lstat(join(root, entry.path))).size,
        };
    } catch {
        execution.throwIfAborted();

        return entry;
    }
}

export type ListCommandInput = {
    project: string; folder: string; glob: string | undefined; recursive: boolean; offset: number; limit: number;
};

export async function listCommand(config: CodeToolsConfig, input: ListCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const project = await resolveNamedProject(config, input.project, execution);
    const folder = normalizeProjectPath(input.folder, 'folder');
    const {
        glob, recursive, offset, limit,
    } = input;

    const prefix = folder === '' ? '' : `${folder}/`;
    const files = await listProjectFiles(config, project.root, execution);
    const filesInFolder: string[] = [];

    for (let index = 0; index < files.length; index++) {
        if (index % 128 === 0) {
            await execution.checkpoint();
        }

        const file = files[index];

        if (file !== undefined && file.startsWith(prefix)) {
            filesInFolder.push(file);
        }
    }

    if (folder !== '' && filesInFolder.length === 0) {
        throw new CommandError('not_found', `Folder "${folder}" has no files that git shows`);
    }

    const matchesGlob = glob === undefined ? null : compileFileGlob(glob);
    let entries: Entry[] = [];

    if (recursive || matchesGlob !== null) {
        for (let index = 0; index < filesInFolder.length; index++) {
            if (index % 128 === 0) {
                await execution.checkpoint();
            }

            const path = filesInFolder[index];

            if (path !== undefined && (matchesGlob === null || matchesGlob(path))) {
                entries.push({
                    path,
                    type: 'file',
                });
            }
        }
    } else {
        entries = await listOneLevel(filesInFolder, folder, execution);
    }

    const page = entries.slice(offset, offset + limit);
    const nextOffset = offset + page.length < entries.length ? offset + page.length : null;

    const sizedEntries = [];

    for (const entry of page) {
        sizedEntries.push(await withSize(project.root, entry, execution));
    }

    execution.throwIfAborted();

    return {
        project: project.name,
        folder,
        total: entries.length,
        entries: sizedEntries,
        nextOffset,
    };
}

export type ListCommandResult = Awaited<ReturnType<typeof listCommand>>;
