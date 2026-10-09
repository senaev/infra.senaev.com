import { posix } from 'node:path';

import { prepareNewNote, normalizeVaultPath } from '../access/vaultAccess';
import { createFileExclusively } from '../access/writeNoteFile';
import { formatFrontmatterBlock } from '../markdown/frontmatter';
import { hashContent } from '../markdown/parseMarkdown';
import {
    optionalObject, optionalString, readToolArguments, requiredNonEmptyString,
} from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';
import { invalidArguments } from '../VaultToolError';

/** `Ideas` and `Ideas.md` both mean the note `Ideas.md`; other extensions are refused later. */
function withNoteExtension(config: VaultToolsConfig, path: string): string {
    return posix.extname(path) === '' ? `${path}${config.noteExtension}` : path;
}

/** Creates a new note, with missing parent folders. Fails if anything already exists there. */
export async function createTool(config: VaultToolsConfig, input: unknown) {
    const args = readToolArguments(input, [
        'path',
        'content',
        'frontmatter',
    ]);
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

    await createFileExclusively(absolutePath, fullContent, path);

    return {
        path,
        hash: hashContent(fullContent),
    };
}
