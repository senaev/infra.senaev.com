import { posix } from 'node:path';

import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { createFileExclusively } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';

import { prepareNewNote, normalizeVaultPath } from '../access/vaultAccess';
import { formatFrontmatterBlock } from '../markdown/frontmatter';
import { createNoteDiff } from '../markdown/createNoteDiff';
import {
    optionalObject, optionalString, readVaultToolArguments, requiredNonEmptyString,
} from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';
import { invalidArguments, VaultToolError } from '../VaultToolError';

/** `Ideas` and `Ideas.md` both mean the note `Ideas.md`; other extensions are refused later. */
export function withNoteExtension(config: VaultToolsConfig, path: string): string {
    return posix.extname(path) === '' ? `${path}${config.noteExtension}` : path;
}

/** Creates a new note, with missing parent folders. Fails if anything already exists there. */
export async function createTool(config: VaultToolsConfig, input: unknown) {
    const args = readVaultToolArguments(input, 'create');
    const path = withNoteExtension(config, normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path'));
    const content = optionalString(args, 'content') ?? '';
    const frontmatter = optionalObject(args, 'frontmatter');

    if (frontmatter !== undefined && content.startsWith('---')) {
        throw invalidArguments('Give the frontmatter either in "frontmatter" or inside "content", not both');
    }

    const fullContent = frontmatter === undefined || Object.keys(frontmatter).length === 0
        ? content
        : `${formatFrontmatterBlock(frontmatter)}${content}`;

    const absolutePath = await prepareNewNote(config, path);

    await createFileExclusively(absolutePath, fullContent).catch((error: unknown) => {
        if (isAlreadyExistsError(error)) {
            throw new VaultToolError('already_exists', `"${path}" already exists; use obsidian-patch to change it`);
        }

        throw error;
    });

    return {
        path,
        ...createNoteDiff(path, '', fullContent),
    };
}
