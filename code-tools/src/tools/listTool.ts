import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

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
function listOneLevel(files: readonly string[], folder: string): Entry[] {
    const prefix = folder === '' ? '' : `${folder}/`;
    const folders = new Set<string>();
    const directFiles: string[] = [];

    for (const file of files) {
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
    if (entry.type === 'folder') {
        return entry;
    }

    try {
        return {
            ...entry,
            size: (await lstat(join(root, entry.path))).size,
        };
    } catch {
        return entry;
    }
}

export async function listTool(config: CodeToolsConfig, input: unknown) {
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
    const filesInFolder = (await listProjectFiles(config, project.root)).filter((file) => file.startsWith(prefix));

    if (folder !== '' && filesInFolder.length === 0) {
        throw new ToolError('not_found', `Folder "${folder}" has no files that git shows`);
    }

    const matchesGlob = glob === undefined ? null : compileFileGlob(glob);
    const entries: Entry[] = recursive || matchesGlob !== null
        ? filesInFolder
            .filter((file) => matchesGlob === null || matchesGlob(file))
            .map((path) => {
                return {
                    path,
                    type: 'file',
                };
            })
        : listOneLevel(filesInFolder, folder);
    const page = entries.slice(offset, offset + limit);
    const nextOffset = offset + page.length < entries.length ? offset + page.length : null;

    return {
        project: project.name,
        folder,
        total: entries.length,
        entries: await Promise.all(page.map((entry) => withSize(project.root, entry))),
        nextOffset,
    };
}
