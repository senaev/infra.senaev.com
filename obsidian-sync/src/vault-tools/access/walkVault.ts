import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { walkDirectory } from 'senaev-utils/src/utils/fs/walkDirectory/walkDirectory';

import type { VaultToolsConfig } from '../vaultToolsConfig';

import {
    isExcludedFolder, isVisibleFile, resolveExistingFolder,
} from './vaultAccess';

export type PathError = {
    path: string;
    message: string;
};

export type VaultWalk = {
    /** Vault-relative paths of every visible file, sorted. */
    files: string[];
    /** Folders that could not be read, so the caller can tell the scan was incomplete. */
    errors: PathError[];
};

export type FolderEntry = {
    path: string;
    type: 'folder' | 'file';
};

/** The order people expect in a file list; `YYYY-MM-DD` names still sort by date. */
function comparePaths(a: string, b: string): number {
    return a.localeCompare(b);
}

function childPath(folder: string, name: string): string {
    return folder === '' ? name : posix.join(folder, name);
}

/**
 * Lists one folder. `Dirent` describes the entry itself without following it, so symlinks
 * are neither files nor folders here and are skipped: the tools never follow them.
 */
async function readFolder(config: VaultToolsConfig, folder: string): Promise<FolderEntry[]> {
    const entries = await readdir(join(config.root, folder), { withFileTypes: true });
    const result: FolderEntry[] = [];

    for (const entry of entries) {
        const path = childPath(folder, entry.name);

        if (entry.isDirectory() && !isExcludedFolder(config, path)) {
            result.push({
                path,
                type: 'folder',
            });
        } else if (entry.isFile() && isVisibleFile(config, path)) {
            result.push({
                path,
                type: 'file',
            });
        }
    }

    return result;
}

/** The visible direct children of a folder, folders first, then files, each sorted by path. */
export async function listFolder(config: VaultToolsConfig, folder: string): Promise<FolderEntry[]> {
    await resolveExistingFolder(config, folder);

    const entries = await readFolder(config, folder);

    return entries.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
        }

        return comparePaths(a.path, b.path);
    });
}

/** Every visible file below `folder`, at any depth. */
export async function walkVault(config: VaultToolsConfig, folder: string): Promise<VaultWalk> {
    await resolveExistingFolder(config, folder);

    // A folder that vanishes mid-walk is normal while sync runs; it is reported, not thrown.
    const { files, errors } = await walkDirectory(config.root, folder, {
        includeFolder: (path) => !isExcludedFolder(config, path),
        includeFile: (path) => isVisibleFile(config, path),
    });

    return {
        files: files.sort(comparePaths),
        errors: errors.map(({ path, error }) => {
            return {
                path,
                message: stringifyUnknownError(error),
            };
        }),
    };
}
