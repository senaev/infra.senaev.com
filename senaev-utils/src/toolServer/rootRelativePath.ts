import {
    mkdir, realpath, stat,
} from 'node:fs/promises';
import { join, posix } from 'node:path';

import { isNotFoundError } from '../utils/Error/isNotFoundError/isNotFoundError';

import { invalidArguments, ToolError } from './ToolError';

/**
 * Turns a path from a tool argument into a clean root-relative POSIX path, `''` for the
 * root. A leading `/` is read as the root, because that is how a model naturally writes
 * "from the top". Anything that climbs out of the root is rejected.
 *
 * @param rootName what the root is called in the error message, e.g. "vault" or "project"
 */
export function normalizeRootRelativePath(input: string, field: string, rootName: string): string {
    if (input.includes('\0') || input.includes('\\')) {
        throw invalidArguments(`"${field}" contains a forbidden character`);
    }

    const normalized = posix.normalize(`./${input.trim().replace(/^\/+/, '')}`).replace(/\/+$/, '');

    if (normalized === '..' || normalized.startsWith('../')) {
        throw new ToolError('forbidden_path', `"${field}" points outside the ${rootName}`);
    }

    return normalized === '.' ? '' : normalized;
}

/**
 * Proves that the absolute path really is `<root>/<relativePath>` with no symlink anywhere
 * on the way, and returns it. Comparing real paths is the only check that catches a symlink
 * placed inside the root, because the requested path looks innocent either way.
 */
export async function assertNoSymlinkOnPath(root: string, relativePath: string): Promise<string> {
    const realRoot = await realpath(root);
    const absolutePath = join(root, relativePath);
    const realPath = await realpath(absolutePath);

    if (realPath !== join(realRoot, relativePath)) {
        throw new ToolError('forbidden_path', `"${relativePath}" goes through a symbolic link, which is not allowed`);
    }

    return absolutePath;
}

function parentOf(relativePath: string): string {
    const parent = posix.dirname(relativePath);

    return parent === '.' ? '' : parent;
}

/**
 * Prepares the place for a new file: checks the deepest folder that already exists for
 * symlinks, then creates the missing folders below it, and returns the absolute path of the
 * file. Whether the file itself already exists is left to the exclusive write, which is the
 * only race-free check.
 */
export async function prepareNewFilePath(root: string, relativePath: string): Promise<string> {
    const parent = parentOf(relativePath);
    let existingAncestor = parent;

    for (;;) {
        try {
            const absolutePath = await assertNoSymlinkOnPath(root, existingAncestor);

            if (!(await stat(absolutePath)).isDirectory()) {
                throw new ToolError('forbidden_path', `"${existingAncestor}" is a file, not a folder`);
            }

            break;
        } catch (error) {
            if (!isNotFoundError(error) || existingAncestor === '') {
                throw error;
            }

            existingAncestor = parentOf(existingAncestor);
        }
    }

    await mkdir(join(root, parent), { recursive: true });

    return join(root, relativePath);
}
