import { isObject } from 'senaev-utils/src/types/Object/Object';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import {
    Document, isMap, isScalar, parseDocument,
} from 'yaml';

import { parseNoteFrontmatter } from '../../markdown/parseNoteFrontmatter';
import { stripFrontmatter } from '../../markdown/stripFrontmatter';
import { VaultToolError } from '../VaultToolError';

export type NoteParts = {
    frontmatter: Record<string, unknown> | null;
    /** Set when the frontmatter is not valid YAML, together with the raw block. */
    frontmatterError?: string;
    frontmatterRaw?: string;
    body: string;
};

/** Splits a note into its parsed frontmatter and body without losing a broken block. */
export function splitNote(content: string): NoteParts {
    const { frontmatter: raw, body } = stripFrontmatter(content);

    if (raw === '') {
        return {
            frontmatter: null,
            body,
        };
    }

    try {
        return {
            frontmatter: parseNoteFrontmatter(content),
            body,
        };
    } catch (error) {
        return {
            frontmatter: null,
            frontmatterError: stringifyUnknownError(error),
            frontmatterRaw: raw,
            body,
        };
    }
}

/** `aliases` (or the legacy `alias`) of a note, as Obsidian reads them. */
export function readAliases(frontmatter: Record<string, unknown> | null): string[] {
    if (frontmatter === null) {
        return [];
    }

    const value = frontmatter.aliases ?? frontmatter.alias;
    const list = Array.isArray(value) ? value : [value];

    return list.filter((alias): alias is string => typeof alias === 'string' && alias.trim() !== '').map((alias) => alias.trim());
}

/**
 * `yaml` attaches a comment line to the key below it, so a plain delete would remove a
 * comment that belongs to the note, not to the property. It moves to the next key instead,
 * or to the end of the block when the deleted key was the last one.
 */
function deleteKeepingComments(document: Document, key: string): void {
    const map = document.contents;

    if (!isMap(map)) {
        document.delete(key);

        return;
    }

    const index = map.items.findIndex((pair) => isScalar(pair.key) && pair.key.value === key);
    const deleted = map.items[index];

    if (deleted === undefined) {
        return;
    }

    map.items.splice(index, 1);

    const comment = isScalar(deleted.key) ? deleted.key.commentBefore : null;

    if (comment === null || comment === undefined || comment === '') {
        return;
    }

    const next = map.items[index];

    if (next !== undefined && isScalar(next.key)) {
        next.key.commentBefore = next.key.commentBefore ? `${comment}\n${next.key.commentBefore}` : comment;
    } else {
        document.comment = document.comment ? `${document.comment}\n${comment}` : comment;
    }
}

/**
 * Sets or deletes (`null`) frontmatter properties through the YAML document model, so
 * comments, key order and formatting of the other properties stay as they were.
 */
export function setFrontmatterProperties(content: string, properties: Record<string, unknown>): string {
    const { frontmatter: raw, body } = stripFrontmatter(content);
    // stripFrontmatter returns the content unchanged when it finds no block.
    const hasBlock = body !== content;

    if (!hasBlock && content.startsWith('---')) {
        throw new VaultToolError(
            'conflict',
            'The note starts with "---" but has no frontmatter block that can be edited safely (unterminated block or Windows line endings)'
        );
    }

    const document = parseDocument(raw, { uniqueKeys: false });

    if (document.errors.length > 0) {
        throw new VaultToolError('conflict', `The frontmatter is not valid YAML: ${document.errors[0]?.message ?? ''}`);
    }

    // Empty contents are fine: `set` creates the map on first use.
    const existing: unknown = document.toJS();

    if (existing !== null && (!isObject(existing) || Array.isArray(existing))) {
        throw new VaultToolError('conflict', 'The frontmatter is not a set of properties');
    }

    for (const [
        key,
        value,
    ] of Object.entries(properties)) {
        if (value === null) {
            deleteKeepingComments(document, key);
        } else {
            document.set(key, value);
        }
    }

    const updated: unknown = document.toJS();
    const hasComments = Boolean(document.comment) || Boolean(document.commentBefore);
    const isEmpty = (!isObject(updated) || Object.keys(updated).length === 0) && !hasComments;

    return isEmpty ? body : `---\n${document.toString()}---\n${body}`;
}

/** The frontmatter block for a new note. */
export function formatFrontmatterBlock(properties: Record<string, unknown>): string {
    return `---\n${new Document(properties).toString()}---\n`;
}
