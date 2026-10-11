import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import { operationCheckpoint, throwIfOperationAborted } from 'senaev-utils/src/operations/operationContext';
import { LIST_LIMITS, MAX_GLOB_LENGTH } from 'senaev-utils/src/codeTools/codeToolLimits';
import { compileFileGlob } from 'senaev-utils/src/toolServer/compileFileGlob';
import {
    optionalBoolean, optionalCappedInteger, optionalString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { listProjectFiles } from '../git/runGit';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    normalizeProjectPath, readCodeToolArguments, resolveProject,
} from './projectAccess';

type Entry = {
    path: string;
    type: 'file' | 'folder';
};

/** The files and folders directly in `folder`, folders first. */
async function listOneLevel(files: readonly string[], folder: string): Promise<Entry[]> {
    const prefix = folder === '' ? '' : `${folder}/`;
    const folders = new Set<string>();
    const directFiles: string[] = [];

    let index = 0;

    for (const file of files) {
        if (index++ % 128 === 0) {
            await operationCheckpoint();
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

async function withSize(root: string, entry: Entry) {
    await operationCheckpoint();
    if (entry.type === 'folder') {
        return entry;
    }

    try {
        return {
            ...entry,
            size: (await lstat(join(root, entry.path))).size,
        };
    } catch {
        throwIfOperationAborted();

        return entry;
    }
}

export async function listTool(config: CodeToolsConfig, input: unknown) {
    throwIfOperationAborted();
    const args = readCodeToolArguments(input, 'list');
    const project = await resolveProject(config, args);
    const folder = normalizeProjectPath(optionalString(args, 'folder') ?? '', 'folder');
    const glob = optionalString(args, 'glob', MAX_GLOB_LENGTH);
    const recursive = optionalBoolean(args, 'recursive') ?? false;
    const offset = optionalCappedInteger(args, 'offset', {
        min: 0,
        max: LIST_LIMITS.maxOffset,
    }) ?? 0;
    const limit = optionalCappedInteger(args, 'limit', {
        min: 1,
        max: LIST_LIMITS.maxLimit,
    }) ?? LIST_LIMITS.defaultLimit;

    const prefix = folder === '' ? '' : `${folder}/`;
    const files = await listProjectFiles(config, project.root);
    const filesInFolder: string[] = [];

    for (let index = 0; index < files.length; index++) {
        if (index % 128 === 0) {
            await operationCheckpoint();
        }

        const file = files[index];

        if (file !== undefined && file.startsWith(prefix)) {
            filesInFolder.push(file);
        }
    }

    if (folder !== '' && filesInFolder.length === 0) {
        throw new ToolError('not_found', `Folder "${folder}" has no files that git shows`);
    }

    const matchesGlob = glob === undefined ? null : compileFileGlob(glob);
    let entries: Entry[] = [];

    if (recursive || matchesGlob !== null) {
        for (let index = 0; index < filesInFolder.length; index++) {
            if (index % 128 === 0) {
                await operationCheckpoint();
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
        entries = await listOneLevel(filesInFolder, folder);
    }

    const page = entries.slice(offset, offset + limit);
    const nextOffset = offset + page.length < entries.length ? offset + page.length : null;

    const sizedEntries = [];

    for (const entry of page) {
        sizedEntries.push(await withSize(project.root, entry));
    }

    throwIfOperationAborted();

    return {
        project: project.name,
        folder,
        total: entries.length,
        entries: sizedEntries,
        nextOffset,
    };
}
