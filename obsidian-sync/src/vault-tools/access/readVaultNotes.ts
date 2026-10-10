import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { readAliases, splitNote } from '../markdown/frontmatter';
import type { VaultToolsConfig } from '../vaultToolsConfig';

import { isNotePath } from './vaultAccess';
import { type PathError, walkVault } from './walkVault';

const MAX_REPORTED_ERRORS = 20;

export type VaultNotes = {
    /** Every visible file, notes and attachments, because links can point at both. */
    files: string[];
    contents: Map<string, string>;
    aliasesByNote: Map<string, string[]>;
    scan: {
        scannedFiles: number;
        complete: boolean;
        readErrorCount: number;
        readErrors: PathError[];
        walkErrors: PathError[];
    };
};

/** Reads every note of the vault. A note that cannot be read is reported, not thrown. */
export async function readVaultNotes(config: VaultToolsConfig): Promise<VaultNotes> {
    const walk = await walkVault(config, '');
    const notePaths = walk.files.filter((file) => isNotePath(config, file));
    const contents = new Map<string, string>();
    const aliasesByNote = new Map<string, string[]>();
    const readErrors: PathError[] = [];

    for (const notePath of notePaths) {
        try {
            const content = await readFile(join(config.root, notePath), 'utf8');

            contents.set(notePath, content);
            aliasesByNote.set(notePath, readAliases(splitNote(content).frontmatter));
        } catch (error) {
            readErrors.push({
                path: notePath,
                message: stringifyUnknownError(error),
            });
        }
    }

    return {
        files: walk.files,
        contents,
        aliasesByNote,
        scan: {
            scannedFiles: notePaths.length,
            complete: walk.errors.length === 0 && readErrors.length === 0,
            readErrorCount: readErrors.length,
            readErrors: readErrors.slice(0, MAX_REPORTED_ERRORS),
            walkErrors: walk.errors.slice(0, MAX_REPORTED_ERRORS),
        },
    };
}
