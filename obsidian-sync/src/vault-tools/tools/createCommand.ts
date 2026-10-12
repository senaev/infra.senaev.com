import { join, posix } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { createFileExclusively } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { invalidArguments, CommandError } from 'senaev-utils/src/commands/CommandError';

import {
    prepareNewNote, normalizeVaultPath, assertNotePath,
} from '../access/vaultAccess';
import { formatFrontmatterBlock } from '../markdown/frontmatter';
import type { VaultToolsConfig } from '../vaultToolsConfig';

/** `Ideas` and `Ideas.md` both mean the note `Ideas.md`; other extensions are refused later. */
export function withNoteExtension(config: VaultToolsConfig, path: string): string {
    return posix.extname(path) === '' ? `${path}${config.noteExtension}` : path;
}

export type CreateCommandInput = {
    path: string;
    content: string;
    frontmatter: Record<string, unknown> | undefined;
};

/** Creates a new note, with missing parent folders. Fails if anything already exists there. */
export async function createCommand(config: VaultToolsConfig, input: CreateCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = withNoteExtension(config, normalizeVaultPath(input.path, 'path'));
    const { content, frontmatter } = input;

    if (frontmatter !== undefined && content.startsWith('---')) {
        throw invalidArguments('Give the frontmatter either in "frontmatter" or inside "content", not both');
    }

    const fullContent = frontmatter === undefined || Object.keys(frontmatter).length === 0
        ? content
        : `${formatFrontmatterBlock(frontmatter)}${content}`;

    return await withFileMutation(join(config.root, path), async () => {
        assertNotePath(config, path);
        const diff = await createFileDiffAsync(path, '', fullContent, execution);
        const absolutePath = await prepareNewNote(config, path, execution);

        await createFileExclusively(absolutePath, fullContent, execution.signal, () => execution.changedPath(path)).catch((error: unknown) => {
            execution.throwIfAborted();
            if (isAlreadyExistsError(error)) {
                throw new CommandError('already_exists', `"${path}" already exists; use patch to change it`);
            }

            throw error;
        });

        return {
            path,
            ...diff,
        };
    }, execution);
}

export type CreateCommandResult = Awaited<ReturnType<typeof createCommand>>;
