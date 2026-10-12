import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { assertExpectedHash } from 'senaev-utils/src/files/contentHash';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { replaceExactlyOnceAsync } from 'senaev-utils/src/files/textEdits';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { setFrontmatterProperties } from '../markdown/frontmatter';
import { findSection } from '../markdown/sections';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export type PatchOperation =
    | { type: 'append'; text: string; section: string | undefined }
    | { type: 'replace'; find: string; replace: string }
    | { type: 'replaceSection'; section: string; content: string }
    | { type: 'setFrontmatter'; properties: Record<string, unknown> };

type Operation = (content: string) => string | Promise<string>;

/** Appended text always starts on a new line; a blank line before it is up to the caller. */
function joinOnNewLine(before: string, text: string): string {
    return before === '' || before.endsWith('\n') ? `${before}${text}` : `${before}\n${text}`;
}

function withTrailingNewline(text: string): string {
    return text.endsWith('\n') ? text : `${text}\n`;
}

function append({ text, section }: Extract<PatchOperation, { type: 'append' }>): Operation {
    return (content) => {
        if (section === undefined) {
            return withTrailingNewline(joinOnNewLine(content, text));
        }

        const { bodyStart, end } = findSection(content, section);
        // Insert after the last non-blank text of the section, so the blank lines that
        // separate it from the next heading stay where they are.
        const insertAt = bodyStart + content.slice(bodyStart, end).trimEnd().length;

        return `${content.slice(0, insertAt)}\n${text.replace(/\n+$/, '')}${content.slice(insertAt)}`;
    };
}

function replace({ find, replace: replacement }: Extract<PatchOperation, { type: 'replace' }>, execution: CommandExecution): Operation {
    return (content) => replaceExactlyOnceAsync(content, find, replacement, {
        documentName: 'note',
        execution,
    });
}

function replaceSection({ section, content: sectionContent }: Extract<PatchOperation, { type: 'replaceSection' }>): Operation {
    return (content) => {
        const { bodyStart, end } = findSection(content, section);
        const isLast = end === content.length;
        const body = sectionContent.replace(/^\n+|\n+$/g, '');
        // The heading line stays as it is, and so does a blank line under it if the note
        // had one. One blank line separates the body from the next heading.
        const blankLineUnderHeading = /^\n[ \t]*\n/.test(content.slice(bodyStart, end)) ? '\n' : '';
        const newBody = `\n${blankLineUnderHeading}${body === '' ? '' : `${body}\n`}${isLast ? '' : '\n'}`;

        return `${content.slice(0, bodyStart)}${newBody}${content.slice(end)}`;
    };
}

function buildOperation(operation: PatchOperation, execution: CommandExecution): Operation {
    switch (operation.type) {
    case 'append': return append(operation);
    case 'replace': return replace(operation, execution);
    case 'replaceSection': return replaceSection(operation);
    case 'setFrontmatter': return (content) => setFrontmatterProperties(content, operation.properties);
    default: throw invalidArguments('Unsupported patch operation');
    }
}

export type PatchCommandInput = {
    path: string;
    expectedHash: string;
    operations: readonly PatchOperation[];
};

/**
 * Applies all operations to the note in memory, in order, and writes the result once.
 * If any operation fails, nothing is written. The expected hash proves the caller edited
 * the version it read.
 */
export async function patchCommand(config: VaultToolsConfig, input: PatchCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = normalizeVaultPath(input.path, 'path');
    const { expectedHash, operations } = input;

    return await withFileMutation(join(config.root, path), async () => {
        const absolutePath = await resolveExistingNote(config, path, execution);
        const original = await readTextFile(absolutePath, execution);

        assertExpectedHash(original, expectedHash, 'note');

        let updated = original;

        for (const operation of operations) {
            await execution.checkpoint();
            updated = await buildOperation(operation, execution)(updated);
        }

        const diff = await createFileDiffAsync(path, original, updated, execution);

        if (updated !== original) {
            assertExpectedHash(await readTextFile(absolutePath, execution), expectedHash, 'note');
            await replaceFileAtomically(absolutePath, updated, execution.signal, () => execution.changedPath(path));
        }

        // No new hash on purpose: the next edit must start from a fresh read.
        return {
            path,
            changed: updated !== original,
            ...diff,
        };
    }, execution);
}

export type PatchCommandResult = Awaited<ReturnType<typeof patchCommand>>;
