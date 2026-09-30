import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { isObject } from 'senaev-utils/src/types/Object/Object';
import { parse } from 'yaml';

import { OBSIDIAN_VAULT_PATH } from '../env';
import { logger } from '../logger';
import { collectVaultMarkdownFiles } from '../telegram-post-sync/collectVaultMarkdownFiles';
import { stripFrontmatter } from '../telegram-post-sync/render/stripFrontmatter';

import type { VaultNote } from './collectMilestones';

export function parseNoteFrontmatter(content: string): Record<string, unknown> | null {
    const { frontmatter } = stripFrontmatter(content.replaceAll('\r\n', '\n'));

    if (frontmatter === '') {
        return null;
    }

    // Obsidian accepts a repeated key, so the parser must not reject the whole note for it.
    const parsed: unknown = parse(frontmatter, { uniqueKeys: false });

    return isObject(parsed) && !Array.isArray(parsed) ? parsed : null;
}

async function readVaultNote(path: string): Promise<VaultNote | null> {
    let content: string;

    try {
        content = await readFile(join(OBSIDIAN_VAULT_PATH, path), 'utf8');
    } catch (error) {
        // A note can vanish between the walk and the read while sync is running.
        logger.warn({
            err: error,
            path,
        }, '⚠️ Could not read note');

        return null;
    }

    let frontmatter: Record<string, unknown> | null;

    try {
        frontmatter = parseNoteFrontmatter(content);
    } catch (error) {
        logger.warn({
            err: error,
            path,
        }, '⚠️ Could not parse note frontmatter');

        return null;
    }

    if (frontmatter === null) {
        return null;
    }

    return {
        path,
        basename: basename(path, '.md'),
        frontmatter,
    };
}

/** Every vault note that has frontmatter, sorted by path so the output order is stable. */
export async function readVaultNotes(): Promise<VaultNote[]> {
    const paths = (await collectVaultMarkdownFiles()).sort();
    const notes: VaultNote[] = [];

    // Sequential on purpose: thousands of parallel reads can run out of file descriptors.
    for (const path of paths) {
        const note = await readVaultNote(path);

        if (note) {
            notes.push(note);
        }
    }

    return notes;
}
