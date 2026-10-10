import { readFile } from 'node:fs/promises';

import { PATCH_OPERATION_FIELDS, type PatchOperationType } from 'senaev-utils/src/obsidianVaultTools/vaultToolDefinitions';
import { PATCH_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { assertExpectedHash, readExpectedHash } from 'senaev-utils/src/toolServer/contentHash';
import { createFileDiff } from 'senaev-utils/src/toolServer/createFileDiff';
import { replaceExactlyOnce } from 'senaev-utils/src/toolServer/textEdits';
import {
    optionalString,
    readToolArguments,
    requiredNonEmptyString,
    requiredString,
    type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/toolServer/ToolError';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { setFrontmatterProperties } from '../markdown/frontmatter';
import { findSection } from '../markdown/sections';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

type Operation = (content: string) => string;

/** Appended text always starts on a new line; a blank line before it is up to the caller. */
function joinOnNewLine(before: string, text: string): string {
    return before === '' || before.endsWith('\n') ? `${before}${text}` : `${before}\n${text}`;
}

function withTrailingNewline(text: string): string {
    return text.endsWith('\n') ? text : `${text}\n`;
}

function append(args: ToolArguments): Operation {
    const text = requiredNonEmptyString(args, 'text');
    const section = optionalString(args, 'section');

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

function replace(args: ToolArguments): Operation {
    const find = requiredNonEmptyString(args, 'find');
    const replacement = requiredString(args, 'replace');

    return (content) => replaceExactlyOnce(content, find, replacement, 'note');
}

function replaceSection(args: ToolArguments): Operation {
    const section = requiredNonEmptyString(args, 'section');
    const sectionContent = requiredString(args, 'content');

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

function setFrontmatter(args: ToolArguments): Operation {
    const { properties } = args;

    if (!isObject(properties) || Array.isArray(properties) || Object.keys(properties).length === 0) {
        throw invalidArguments('"properties" must be a non-empty JSON object; use null as a value to delete a property');
    }

    return (content) => setFrontmatterProperties(content, properties);
}

const OPERATION_BUILDERS: Record<PatchOperationType, (args: ToolArguments) => Operation> = {
    append,
    replace,
    replaceSection,
    setFrontmatter,
};

function readOperations(value: unknown): Operation[] {
    const { maxOperations } = PATCH_LIMITS;

    if (!Array.isArray(value) || value.length === 0 || value.length > maxOperations) {
        throw invalidArguments(`"operations" must be an array of 1 to ${maxOperations} operations`);
    }

    return value.map((item: unknown, index) => {
        const type = isObject(item) ? item.type : undefined;

        if (typeof type !== 'string' || !Object.hasOwn(PATCH_OPERATION_FIELDS, type)) {
            throw invalidArguments(`"operations[${index}].type" must be one of: ${Object.keys(PATCH_OPERATION_FIELDS).join(', ')}`);
        }

        const name = type as PatchOperationType;

        return OPERATION_BUILDERS[name](readToolArguments(item, [
            'type',
            ...PATCH_OPERATION_FIELDS[name],
        ]));
    });
}

/**
 * Applies all operations to the note in memory, in order, and writes the result once.
 * If any operation fails, nothing is written. The expected hash proves the caller edited
 * the version it read.
 */
export async function patchTool(config: VaultToolsConfig, input: unknown) {
    const args = readVaultToolArguments(input, 'patch');
    const path = normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path');
    const expectedHash = readExpectedHash(args, 'expectedHash', 'obsidian-read');
    const operations = readOperations(args.operations);
    const absolutePath = await resolveExistingNote(config, path);
    const original = await readFile(absolutePath, 'utf8');

    assertExpectedHash(original, expectedHash, 'note');

    const updated = operations.reduce((content, operation) => operation(content), original);

    if (updated !== original) {
        await replaceFileAtomically(absolutePath, updated);
    }

    // No new hash on purpose: the next edit must start from a fresh read.
    return {
        path,
        changed: updated !== original,
        ...createFileDiff(path, original, updated),
    };
}
