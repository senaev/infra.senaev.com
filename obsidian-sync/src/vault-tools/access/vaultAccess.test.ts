import { symlink } from 'node:fs/promises';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';
import { listTool } from '../tools/listTool';
import { readTool } from '../tools/readTool';
import { searchTool } from '../tools/searchTool';

import { normalizeVaultPath } from './vaultAccess';

let vault: TestVault;

beforeEach(async () => {
    vault = await createTestVault({
        'Visible.md': 'secret word',
        'notes/Deep.md': 'secret word',
        '.obsidian/workspace.md': 'secret word',
        '.trash/Old.md': 'secret word',
        'plugins/senaev-personal-tools/README.md': 'secret word',
        'notes/node_modules/pkg/README.md': 'secret word',
        'notes/.hidden.md': 'secret word',
        'Drawing.excalidraw.md': 'secret word',
        'image.png': 'secret word',
    });
});

afterEach(async () => {
    await vault.remove();
});

describe('normalizeVaultPath', () => {
    it('reads a leading slash as the vault root and drops "./" and trailing slashes', () => {
        expect(normalizeVaultPath('/notes/Deep.md', 'path')).toBe('notes/Deep.md');
        expect(normalizeVaultPath('./notes/', 'path')).toBe('notes');
        expect(normalizeVaultPath('', 'path')).toBe('');
    });

    it('rejects paths that climb out of the vault, and forbidden characters', () => {
        expect(() => normalizeVaultPath('../etc/passwd', 'path')).toThrow('outside the vault');
        expect(() => normalizeVaultPath('notes/../../x.md', 'path')).toThrow('outside the vault');
        expect(() => normalizeVaultPath('a\0b', 'path')).toThrow('forbidden character');
    });
});

describe('vault exclusions', () => {
    it('lists and searches only visible notes', async () => {
        const listed = await listTool(vault.config, { recursive: true });
        const searched = await searchTool(vault.config, { queries: ['secret'] });

        expect(listed.entries.map((entry) => entry.path)).toEqual([
            'notes/Deep.md',
            'Visible.md',
        ]);
        expect(searched.scannedFiles).toBe(2);
    });

    it('does not show excluded folders in a folder listing', async () => {
        const listed = await listTool(vault.config, {});

        expect(listed.entries.map((entry) => entry.path)).toEqual([
            'notes',
            'Visible.md',
        ]);
    });

    it.each([
        '.obsidian/workspace.md',
        'plugins/senaev-personal-tools/README.md',
        'notes/node_modules/pkg/README.md',
        'notes/.hidden.md',
        'Drawing.excalidraw.md',
        'image.png',
    ])('refuses to read %s', async (path) => {
        await expect(readTool(vault.config, { paths: [path] })).rejects.toMatchObject({ code: 'forbidden_path' });
    });

    it('refuses to list an excluded folder', async () => {
        await expect(listTool(vault.config, { folder: '.trash' })).rejects.toMatchObject({ code: 'forbidden_path' });
    });

    it('never follows a symlink, to a file or to a folder', async () => {
        await symlink(vault.path('.obsidian/workspace.md'), vault.path('Link.md'));
        await symlink(vault.path('plugins'), vault.path('linked-folder'));

        const listed = await listTool(vault.config, { recursive: true });

        expect(listed.entries.map((entry) => entry.path)).toEqual([
            'notes/Deep.md',
            'Visible.md',
        ]);
        await expect(readTool(vault.config, { paths: ['Link.md'] })).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(listTool(vault.config, { folder: 'linked-folder' })).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});
