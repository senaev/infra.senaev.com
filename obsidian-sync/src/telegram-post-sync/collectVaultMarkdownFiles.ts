import { posix } from 'node:path';

import { walkDirectory } from 'senaev-utils/src/utils/fs/walkDirectory/walkDirectory';

import { OBSIDIAN_VAULT_PATH } from '../env';
import { logger } from '../logger';

import { IGNORED_DIRECTORIES } from './ignoredPaths';

/** Every markdown file in the vault, as paths relative to the vault root. */
export async function collectVaultMarkdownFiles(): Promise<string[]> {
    const { files, errors } = await walkDirectory(OBSIDIAN_VAULT_PATH, '', {
        includeFolder: (path) => !IGNORED_DIRECTORIES.has(posix.basename(path)),
        includeFile: (path) => path.endsWith('.md'),
    });

    // A directory that vanished mid-walk is normal while sync is running, and one we cannot
    // read is not worth failing the whole pass over.
    for (const { path, error } of errors) {
        logger.warn({
            err: error,
            directory: path,
        }, '⚠️ Could not read directory during walk');
    }

    return files;
}
