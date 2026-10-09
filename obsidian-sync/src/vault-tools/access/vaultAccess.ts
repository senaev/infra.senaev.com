import {
    mkdir, realpath, stat,
} from 'node:fs/promises';
import { join, posix } from 'node:path';

import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import type { VaultToolsConfig } from '../vaultToolsConfig';
import { invalidArguments, VaultToolError } from '../VaultToolError';

/**
 * Turns a path from a tool argument into a clean vault-relative POSIX path, `''` for the
 * root. A leading `/` is read as the vault root, because that is how a model naturally
 * writes "from the top of the vault". Anything that climbs out of the root is rejected.
 */
export function normalizeVaultPath(input: string, field: string): string {
    if (input.includes('\0') || input.includes('\\')) {
        throw invalidArguments(`"${field}" contains a forbidden character`);
    }

    const normalized = posix.normalize(`./${input.trim().replace(/^\/+/, '')}`).replace(/\/+$/, '');

    if (normalized === '..' || normalized.startsWith('../')) {
        throw new VaultToolError('forbidden_path', `"${field}" points outside the vault`);
    }

    return normalized === '.' ? '' : normalized;
}

function segmentsOf(relativePath: string): string[] {
    return relativePath === '' ? [] : relativePath.split('/');
}

/** True when the folder, or one of its parents, is hidden from the tools. */
export function isExcludedFolder(config: VaultToolsConfig, relativePath: string): boolean {
    const isInsideExcludedFolder = config.excludedFolders
        .some((folder) => relativePath === folder || relativePath.startsWith(`${folder}/`));

    return isInsideExcludedFolder || segmentsOf(relativePath)
        .some((segment) => segment.startsWith('.') || config.excludedFolderNames.includes(segment));
}

/** True for any file the tools may see, notes and attachments alike. */
export function isVisibleFile(config: VaultToolsConfig, relativePath: string): boolean {
    return relativePath !== '' && !isExcludedFolder(config, relativePath) && !config.excludedFileSuffixes.some((suffix) => relativePath.endsWith(suffix));
}

export function isNotePath(config: VaultToolsConfig, relativePath: string): boolean {
    return isVisibleFile(config, relativePath) && relativePath.endsWith(config.noteExtension);
}

/**
 * Proves that the absolute path really is `<root>/<relativePath>` with no symlink anywhere
 * on the way. Comparing real paths is the only check that catches a symlink placed inside
 * the vault, because the requested path looks innocent either way.
 */
async function assertNoSymlinkOnPath(config: VaultToolsConfig, relativePath: string): Promise<string> {
    const realRoot = await realpath(config.root);
    const absolutePath = join(config.root, relativePath);
    const realPath = await realpath(absolutePath);

    if (realPath !== join(realRoot, relativePath)) {
        throw new VaultToolError('forbidden_path', `"${relativePath}" goes through a symbolic link, which is not allowed`);
    }

    return absolutePath;
}

/** Resolves a folder that must exist and be visible. `''` is the vault root. */
export async function resolveExistingFolder(config: VaultToolsConfig, relativePath: string): Promise<string> {
    if (isExcludedFolder(config, relativePath)) {
        throw new VaultToolError('forbidden_path', `Folder "${relativePath}" is excluded from the vault tools`);
    }

    try {
        const absolutePath = await assertNoSymlinkOnPath(config, relativePath);

        if (!(await stat(absolutePath)).isDirectory()) {
            throw new VaultToolError('not_found', `"${relativePath}" is not a folder`);
        }

        return absolutePath;
    } catch (error) {
        if (isNotFoundError(error)) {
            throw new VaultToolError('not_found', `Folder "${relativePath}" does not exist`);
        }

        throw error;
    }
}

function assertNotePath(config: VaultToolsConfig, relativePath: string): void {
    if (!isNotePath(config, relativePath)) {
        throw new VaultToolError(
            'forbidden_path',
            `"${relativePath}" is not an accessible note: only ${config.noteExtension} files outside excluded folders are allowed`
        );
    }
}

/** Resolves a note that must exist. Reads and edits both go through here. */
export async function resolveExistingNote(config: VaultToolsConfig, relativePath: string): Promise<string> {
    assertNotePath(config, relativePath);

    try {
        const absolutePath = await assertNoSymlinkOnPath(config, relativePath);

        if (!(await stat(absolutePath)).isFile()) {
            throw new VaultToolError('not_found', `"${relativePath}" is not a file`);
        }

        return absolutePath;
    } catch (error) {
        if (isNotFoundError(error)) {
            throw new VaultToolError('not_found', `Note "${relativePath}" does not exist`);
        }

        throw error;
    }
}

/**
 * Prepares the place for a new note: checks the deepest folder that already exists for
 * symlinks, then creates the missing folders below it. Whether the note itself already
 * exists is left to the exclusive write, which is the only race-free check.
 */
export async function prepareNewNote(config: VaultToolsConfig, relativePath: string): Promise<string> {
    assertNotePath(config, relativePath);

    const parent = posix.dirname(relativePath) === '.' ? '' : posix.dirname(relativePath);
    let existingAncestor = parent;

    for (;;) {
        try {
            const absolutePath = await assertNoSymlinkOnPath(config, existingAncestor);

            if (!(await stat(absolutePath)).isDirectory()) {
                throw new VaultToolError('forbidden_path', `"${existingAncestor}" is a file, not a folder`);
            }

            break;
        } catch (error) {
            if (!isNotFoundError(error) || existingAncestor === '') {
                throw error;
            }

            const next = posix.dirname(existingAncestor);

            existingAncestor = next === '.' ? '' : next;
        }
    }

    await mkdir(join(config.root, parent), { recursive: true });

    return join(config.root, relativePath);
}
