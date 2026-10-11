import { join, posix } from 'node:path';

import { operationContext, recordChangedPath } from 'senaev-utils/src/operations/operationContext';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { createFileExclusively } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { createFileDiffAsync } from 'senaev-utils/src/toolServer/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/toolServer/withFileMutation';
import {
    optionalObject, optionalString, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';

import {
    prepareNewNote, normalizeVaultPath, assertNotePath,
} from '../access/vaultAccess';
import { formatFrontmatterBlock } from '../markdown/frontmatter';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

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

    return await withFileMutation(join(config.root, path), async () => {
        assertNotePath(config, path);
        const diff = await createFileDiffAsync(path, '', fullContent);
        const absolutePath = await prepareNewNote(config, path);

        await createFileExclusively(absolutePath, fullContent, operationContext()?.signal, () => recordChangedPath(path)).catch((error: unknown) => {
            if (isAlreadyExistsError(error)) {
                throw new ToolError('already_exists', `"${path}" already exists; use obsidian-patch to change it`);
            }

            throw error;
        });

        return {
            path,
            ...diff,
        };
    });
}
