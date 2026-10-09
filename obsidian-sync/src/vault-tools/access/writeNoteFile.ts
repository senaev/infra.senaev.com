import { randomBytes } from 'node:crypto';
import {
    link, rename, rm, writeFile,
} from 'node:fs/promises';
import {
    basename, dirname, join,
} from 'node:path';

import { VaultToolError } from '../VaultToolError';

/**
 * Dot-prefixed and not a `.md` file, so neither Obsidian, `ob sync` nor our own watcher
 * picks it up during the brief moment it exists. Random, so two writes never share one.
 */
async function writeTemporaryFile(absolutePath: string, content: string): Promise<string> {
    const temporaryPath = join(
        dirname(absolutePath),
        `.${basename(absolutePath)}.${randomBytes(6).toString('hex')}.vault-tools.tmp`
    );

    await writeFile(temporaryPath, content, {
        encoding: 'utf8',
        flag: 'wx',
    });

    return temporaryPath;
}

/** Swaps the new content in with a rename, so a crash never leaves a half-written note. */
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
 * Creates the file only if nothing exists at the path. `link` fails with `EEXIST` instead
 * of overwriting, which makes "fail if it already exists" a single atomic step.
 */
export async function createFileExclusively(absolutePath: string, content: string, relativePath: string): Promise<void> {
    const temporaryPath = await writeTemporaryFile(absolutePath, content);

    try {
        await link(temporaryPath, absolutePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new VaultToolError('already_exists', `"${relativePath}" already exists; use obsidian-patch to change it`);
        }

        throw error;
    } finally {
        await rm(temporaryPath, { force: true });
    }
}
