import { randomBytes } from 'node:crypto';
import {
    chmod, link, rename, rm, stat, writeFile,
} from 'node:fs/promises';
import {
    basename, dirname, join,
} from 'node:path';

import { isNotFoundError } from '../../Error/isNotFoundError/isNotFoundError';

const PERMISSION_BITS = 0o7777;

/**
 * Writes the content to a new file next to the target. Dot-prefixed with a `.tmp` extension,
 * so file watchers and sync tools that look for a known extension ignore it during the brief
 * moment it exists. Random, so two writes never share one.
 */
async function writeTemporaryFile(absolutePath: string, content: string): Promise<string> {
    const temporaryPath = join(
        dirname(absolutePath),
        `.${basename(absolutePath)}.${randomBytes(6).toString('hex')}.tmp`
    );

    await writeFile(temporaryPath, content, {
        encoding: 'utf8',
        flag: 'wx',
    });

    return temporaryPath;
}

/** The permission bits of an existing file, so a script stays executable after a rewrite. */
async function copyFileMode(fromPath: string, toPath: string): Promise<void> {
    try {
        await chmod(toPath, (await stat(fromPath)).mode & PERMISSION_BITS);
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }
}

/**
 * Swaps the new content in with a rename, so a crash never leaves a half-written file.
 * The file keeps its permission bits.
 */
export async function replaceFileAtomically(absolutePath: string, content: string): Promise<void> {
    const temporaryPath = await writeTemporaryFile(absolutePath, content);

    try {
        await copyFileMode(absolutePath, temporaryPath);
        await rename(temporaryPath, absolutePath);
    } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
    }
}

/**
 * Creates the file only if nothing exists at the path, and fails with `EEXIST` otherwise.
 * `link` never overwrites, which makes "fail if it already exists" a single atomic step,
 * and the file appears with its full content at once.
 */
export async function createFileExclusively(absolutePath: string, content: string): Promise<void> {
    const temporaryPath = await writeTemporaryFile(absolutePath, content);

    try {
        await link(temporaryPath, absolutePath);
    } finally {
        await rm(temporaryPath, { force: true });
    }
}
