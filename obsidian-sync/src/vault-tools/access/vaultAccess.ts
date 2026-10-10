import { stat } from 'node:fs/promises';

import {
    assertNoSymlinkOnPath, normalizeRootRelativePath, prepareNewFilePath,
} from 'senaev-utils/src/toolServer/rootRelativePath';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import type { VaultToolsConfig } from '../vaultToolsConfig';

/** A clean vault-relative path from a tool argument, `''` for the root; see `normalizeRootRelativePath`. */
export function normalizeVaultPath(input: string, field: string): string {
    return normalizeRootRelativePath(input, field, 'vault');
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

/** Resolves a folder that must exist and be visible. `''` is the vault root. */
export async function resolveExistingFolder(config: VaultToolsConfig, relativePath: string): Promise<string> {
    if (isExcludedFolder(config, relativePath)) {
        throw new ToolError('forbidden_path', `Folder "${relativePath}" is excluded from the vault tools`);
    }

    try {
        const absolutePath = await assertNoSymlinkOnPath(config.root, relativePath);

        if (!(await stat(absolutePath)).isDirectory()) {
            throw new ToolError('not_found', `"${relativePath}" is not a folder`);
        }

        return absolutePath;
    } catch (error) {
        if (isNotFoundError(error)) {
            throw new ToolError('not_found', `Folder "${relativePath}" does not exist`);
        }

        throw error;
    }
}

export function assertNotePath(config: VaultToolsConfig, relativePath: string): void {
    if (!isNotePath(config, relativePath)) {
        throw new ToolError(
            'forbidden_path',
            `"${relativePath}" is not an accessible note: only ${config.noteExtension} files outside excluded folders are allowed`
        );
    }
}

/** Resolves a note that must exist. Reads and edits both go through here. */
export async function resolveExistingNote(config: VaultToolsConfig, relativePath: string): Promise<string> {
    assertNotePath(config, relativePath);

    try {
        const absolutePath = await assertNoSymlinkOnPath(config.root, relativePath);

        if (!(await stat(absolutePath)).isFile()) {
            throw new ToolError('not_found', `"${relativePath}" is not a file`);
        }

        return absolutePath;
    } catch (error) {
        if (isNotFoundError(error)) {
            throw new ToolError('not_found', `Note "${relativePath}" does not exist`);
        }

        throw error;
    }
}

/** Prepares the place for a new note; see `prepareNewFilePath`. */
export function prepareNewNote(config: VaultToolsConfig, relativePath: string): Promise<string> {
    assertNotePath(config, relativePath);

    return prepareNewFilePath(config.root, relativePath);
}
