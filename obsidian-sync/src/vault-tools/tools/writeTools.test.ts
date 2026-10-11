import { readdir, readFile } from 'node:fs/promises';

import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { createTool } from './createTool';
import { patchTool } from './patchTool';
import { readTool } from './readTool';

let vault: TestVault | undefined;

async function vaultWith(files: Record<string, string>): Promise<TestVault> {
    vault = await createTestVault(files);

    return vault;
}

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

async function hashOf(testVault: TestVault, path: string): Promise<string> {
    const [note] = (await readTool(testVault.config, { paths: [path] })).notes;

    return note?.hash ?? '';
}

describe('createTool', () => {
    it('creates a note with frontmatter and missing parent folders', async () => {
        const testVault = await vaultWith({});

        const result = await createTool(testVault.config, {
            path: 'places/cities/Lisbon',
            frontmatter: { aliases: ['Lisboa'] },
            content: '# Lisbon\n',
        });

        expect(result.path).toBe('places/cities/Lisbon.md');
        expect(await readFile(testVault.path('places/cities/Lisbon.md'), 'utf8'))
            .toBe('---\naliases:\n  - Lisboa\n---\n# Lisbon\n');
        expect(result).not.toHaveProperty('hash');
        expect(result.diff).toBe([
            '--- a/places/cities/Lisbon.md',
            '+++ b/places/cities/Lisbon.md',
            '@@ -0,0 +1,5 @@',
            '+---',
            '+aliases:',
            '+  - Lisboa',
            '+---',
            '+# Lisbon',
            '',
        ].join('\n'));
    });

    it('fails without touching an existing note', async () => {
        const testVault = await vaultWith({ 'Note.md': 'original' });

        await expect(createTool(testVault.config, {
            path: 'Note.md',
            content: 'new',
        })).rejects.toMatchObject({ code: 'already_exists' });
        expect(await readFile(testVault.path('Note.md'), 'utf8')).toBe('original');
        expect(await readdir(testVault.config.root)).toEqual(['Note.md']);
    });

    it('applies the same access rules as reads', async () => {
        const testVault = await vaultWith({});

        await expect(createTool(testVault.config, { path: '.obsidian/x.md' })).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(createTool(testVault.config, { path: 'plugins/x.md' })).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(createTool(testVault.config, { path: '../outside.md' })).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(createTool(testVault.config, { path: 'image.png' })).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});

const NOTE = [
    '---',
    '# a comment the edit must keep',
    'aliases: [Plans]',
    'status: draft',
    '---',
    '# Plans',
    '',
    '## Done',
    '',
    '- one',
    '',
    '## Todo',
    '',
    '- two',
    '- two',
    '',
].join('\n');

describe('patchTool', () => {
    it('refuses to edit a note that changed since it was read, and writes nothing', async () => {
        const testVault = await vaultWith({ 'Note.md': NOTE });
        const currentHash = await hashOf(testVault, 'Note.md');

        await expect(patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash: 'a'.repeat(64),
            operations: [
                {
                    type: 'append',
                    text: 'more',
                },
            ],
        })).rejects.toMatchObject({
            code: 'conflict',
            details: { currentHash },
        });
        expect(await readFile(testVault.path('Note.md'), 'utf8')).toBe(NOTE);
    });

    it('requires the expected hash', async () => {
        const testVault = await vaultWith({ 'Note.md': NOTE });

        await expect(patchTool(testVault.config, {
            path: 'Note.md',
            operations: [
                {
                    type: 'append',
                    text: 'x',
                },
            ],
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });

    it('applies several operations in order, keeps the rest of the note, and returns the new hash', async () => {
        const testVault = await vaultWith({ 'Note.md': NOTE });

        const result = await patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash: await hashOf(testVault, 'Note.md'),
            operations: [
                {
                    type: 'setFrontmatter',
                    properties: {
                        status: 'active',
                        aliases: null,
                        updated: '2026-10-09',
                    },
                },
                {
                    type: 'append',
                    section: 'Done',
                    text: '- three',
                },
                {
                    type: 'replaceSection',
                    section: 'Todo',
                    content: '- four',
                },
                {
                    type: 'replace',
                    find: '# Plans',
                    replace: '# My plans',
                },
            ],
        });

        const updated = await readFile(testVault.path('Note.md'), 'utf8');

        expect(updated).toBe([
            '---',
            '# a comment the edit must keep',
            'status: active',
            'updated: 2026-10-09',
            '---',
            '# My plans',
            '',
            '## Done',
            '',
            '- one',
            '- three',
            '',
            '## Todo',
            '',
            '- four',
            '',
        ].join('\n'));
        expect(result).toMatchObject({
            changed: true,
            diffTruncated: false,
        });
        expect(result).not.toHaveProperty('hash');
        expect(result).not.toHaveProperty('previousHash');
        // The diff covers the frontmatter too, and keeps the unchanged comment as context.
        expect(result.diff).toContain(' # a comment the edit must keep\n-aliases: [Plans]\n-status: draft\n+status: active\n+updated: 2026-10-09\n');
        expect(result.diff).toContain('-# Plans\n+# My plans\n');
        expect(result.diff).toContain('+- three\n');
        expect(result.diff).toContain('-- two\n-- two\n+- four\n');
        expect(await readdir(testVault.config.root)).toEqual(['Note.md']);
    });

    it('returns an empty diff and writes nothing when the operations change nothing', async () => {
        const testVault = await vaultWith({ 'Note.md': NOTE });

        const result = await patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash: await hashOf(testVault, 'Note.md'),
            operations: [
                {
                    type: 'replace',
                    find: '# Plans',
                    replace: '# Plans',
                },
            ],
        });

        expect(result).toMatchObject({
            changed: false,
            diffTruncated: false,
        });
        expect(result.diff).not.toMatch(/^[-+][^-+]/m);
    });

    it('appends at the end of the note on a new line', async () => {
        const testVault = await vaultWith({ 'Note.md': 'no trailing newline' });

        await patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash: await hashOf(testVault, 'Note.md'),
            operations: [
                {
                    type: 'append',
                    text: '\nnew paragraph',
                },
            ],
        });

        expect(await readFile(testVault.path('Note.md'), 'utf8')).toBe('no trailing newline\n\nnew paragraph\n');
    });

    it('rejects a replacement whose text occurs more than once, and writes nothing', async () => {
        const testVault = await vaultWith({ 'Note.md': NOTE });

        await expect(patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash: await hashOf(testVault, 'Note.md'),
            operations: [
                {
                    type: 'append',
                    text: 'would be lost',
                },
                {
                    type: 'replace',
                    find: '- two',
                    replace: '- 2',
                },
            ],
        })).rejects.toMatchObject({
            code: 'ambiguous',
            details: {
                lines: [
                    14,
                    15,
                ],
            },
        });
        expect(await readFile(testVault.path('Note.md'), 'utf8')).toBe(NOTE);
    });

    it('rejects a replacement whose text does not occur', async () => {
        const testVault = await vaultWith({ 'Note.md': NOTE });

        await expect(patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash: await hashOf(testVault, 'Note.md'),
            operations: [
                {
                    type: 'replace',
                    find: 'missing',
                    replace: 'x',
                },
            ],
        })).rejects.toMatchObject({ code: 'not_found' });
    });

    it('creates a frontmatter block when the note has none', async () => {
        const testVault = await vaultWith({ 'Note.md': '# Title\n' });

        await patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash: await hashOf(testVault, 'Note.md'),
            operations: [
                {
                    type: 'setFrontmatter',
                    properties: { birthday: '2020-08-20' },
                },
            ],
        });

        expect(await readFile(testVault.path('Note.md'), 'utf8')).toBe('---\nbirthday: 2020-08-20\n---\n# Title\n');
    });

    it('rejects an unknown operation and an unknown operation field', async () => {
        const testVault = await vaultWith({ 'Note.md': NOTE });
        const expectedHash = await hashOf(testVault, 'Note.md');

        await expect(patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash,
            operations: [{ type: 'delete' }],
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(patchTool(testVault.config, {
            path: 'Note.md',
            expectedHash,
            operations: [
                {
                    type: 'append',
                    text: 'x',
                    position: 'top',
                },
            ],
        })).rejects.toThrow('Unknown argument(s): position');
    });
});
