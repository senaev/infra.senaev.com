import { randomBytes } from 'node:crypto';
import {
    link, rename, rm, writeFile,
} from 'node:fs/promises';
import {
    basename, dirname, join,
} from 'node:path';

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

/** Swaps the new content in with a rename, so a crash never leaves a half-written file. */
export async function replaceFileAtomically(absolutePath: string, content: string): Promise<void> {
    const temporaryPath = await writeTemporaryFile(absolutePath, content);

    try {
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
