import { access, readFile } from 'node:fs/promises';

import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { moveTool } from './moveTool';

let vault: TestVault | undefined;

async function vaultWith(files: Record<string, string>): Promise<TestVault> {
    vault = await createTestVault(files);

    return vault;
}

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

function exists(testVault: TestVault, path: string): Promise<boolean> {
    return access(testVault.path(path)).then(() => true, () => false);
}

function read(testVault: TestVault, path: string): Promise<string> {
    return readFile(testVault.path(path), 'utf8');
}

describe('moveTool', () => {
    it('renames a note and rewrites the wikilinks to it, keeping heading, block, display text and embeds', async () => {
        const testVault = await vaultWith({
            'Ideas.md': '# Ideas\n\nSee [[#Ideas]] and [[Ideas#Ideas]].\n',
            'diary/2026-10-10.md': [
                'Read [[Ideas]], [[ideas#Week 3|this week]], ![[Ideas#^abc]].',
                '| a | [[Ideas\\|table]] |',
                'Not [[Other]].',
                '',
            ].join('\n'),
            'Other.md': 'other',
        });

        const result = await moveTool(testVault.config, {
            path: 'Ideas.md',
            newPath: 'Old ideas',
        });

        expect(result).toMatchObject({
            path: 'Ideas.md',
            newPath: 'Old ideas.md',
            changedNotes: 2,
            rewrittenLinks: 5,
            skippedLinkCount: 0,
            complete: true,
        });
        expect(await exists(testVault, 'Ideas.md')).toBe(false);
        expect(await read(testVault, 'Old ideas.md')).toBe('# Ideas\n\nSee [[#Ideas]] and [[Old ideas#Ideas]].\n');
        expect(await read(testVault, 'diary/2026-10-10.md')).toBe([
            'Read [[Old ideas]], [[Old ideas#Week 3|this week]], ![[Old ideas#^abc]].',
            '| a | [[Old ideas\\|table]] |',
            'Not [[Other]].',
            '',
        ].join('\n'));
        expect(result.diffs.map((diff) => diff.path)).toEqual([
            'diary/2026-10-10.md',
            'Old ideas.md',
        ]);
        expect(result.diffs[0]?.diff).toContain('+Read [[Old ideas]]');
    });

    it('keeps name-only wikilinks on a move to another folder, and fixes the relative Markdown links', async () => {
        const testVault = await vaultWith({
            'notes/Trip.md': 'Photo: ![p](../_Resources/a%20b.png), see [[Lisbon]] and [b](Plan.md#Day%201).\n',
            'notes/Plan.md': 'Back to [trip](Trip.md) and [[Trip]].\n',
            '_Resources/a b.png': 'png',
            'Lisbon.md': 'city',
        });

        const result = await moveTool(testVault.config, {
            path: 'notes/Trip.md',
            newPath: 'archive/2026/Trip (old).md',
        });

        expect(await read(testVault, 'archive/2026/Trip (old).md'))
            .toBe('Photo: ![p](../../_Resources/a%20b.png), see [[Lisbon]] and [b](../../notes/Plan.md#Day%201).\n');
        expect(await read(testVault, 'notes/Plan.md'))
            .toBe('Back to [trip](../archive/2026/Trip%20%28old%29.md) and [[Trip (old)]].\n');
        expect(result.rewrittenLinks).toBe(4);
    });

    it('writes the path when the new name is taken by another note, for that note too', async () => {
        const testVault = await vaultWith({
            'inbox/Draft.md': 'draft',
            'work/Flex.md': 'work flex',
            'Note.md': 'See [[Draft]] and [[Flex]].\n',
        });

        await moveTool(testVault.config, {
            path: 'inbox/Draft.md',
            newPath: 'ideas/Flex.md',
        });

        expect(await read(testVault, 'Note.md')).toBe('See [[ideas/Flex]] and [[work/Flex]].\n');
    });

    it('reports links that were ambiguous or alias-only, and leaves them as they are', async () => {
        const testVault = await vaultWith({
            'a/Flex.md': '---\naliases:\n  - Flexi\n---\nflex',
            'b/Flex.md': 'other flex',
            'Note.md': 'See [[Flex]] and [[Flexi]].\n',
        });

        const result = await moveTool(testVault.config, {
            path: 'a/Flex.md',
            newPath: 'a/Flex 2.md',
        });

        expect(await read(testVault, 'Note.md')).toBe('See [[Flex]] and [[Flexi]].\n');
        expect(result.skippedLinks).toEqual([
            {
                source: 'Note.md',
                line: 1,
                raw: '[[Flex]]',
                reason: 'ambiguous',
            },
            {
                source: 'Note.md',
                line: 1,
                raw: '[[Flexi]]',
                reason: 'alias',
            },
        ]);
    });

    it('refuses to overwrite and changes nothing', async () => {
        const testVault = await vaultWith({
            'A.md': 'a',
            'B.md': 'b',
            'Note.md': '[[A]]',
        });

        await expect(moveTool(testVault.config, {
            path: 'A.md',
            newPath: 'B.md',
        })).rejects.toMatchObject({ code: 'already_exists' });
        expect(await read(testVault, 'A.md')).toBe('a');
        expect(await read(testVault, 'Note.md')).toBe('[[A]]');
    });

    it('moves only notes', async () => {
        const testVault = await vaultWith({
            'A.md': 'a',
            'image.png': 'png',
        });

        await expect(moveTool(testVault.config, {
            path: 'image.png',
            newPath: 'img.png',
        })).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(moveTool(testVault.config, {
            path: 'A.md',
            newPath: 'plugins/A.md',
        })).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(moveTool(testVault.config, {
            path: 'A.md',
            newPath: 'A',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});
