import { readFile, symlink } from 'node:fs/promises';

import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { diaryAppendTool } from './diaryAppendTool';

const DRAFT = '@senaev/daily_note_draft.md';
const RECORD = /^\n\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\n\nМы гуляли\. ✍️\n$/;

let vault: TestVault | undefined;

async function vaultWith(files: Record<string, string>): Promise<TestVault> {
    vault = await createTestVault(files);

    return vault;
}

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

describe('diaryAppendTool', () => {
    it('appends a timestamped record after the existing records and keeps them', async () => {
        const existing = '\n2026-10-09 19-36-20\n\nEarlier record ✍️\n';
        const { config, path } = await vaultWith({ [DRAFT]: existing });

        const result = await diaryAppendTool(config, { text: '  Мы гуляли.  ' });
        const content = await readFile(path(DRAFT), 'utf8');

        expect(result).toEqual({ path: DRAFT });
        expect(content.startsWith(existing)).toBe(true);
        expect(content.slice(existing.length)).toMatch(RECORD);
    });

    it('creates the draft and its folder when they are missing', async () => {
        const { config, path } = await vaultWith({});

        await diaryAppendTool(config, { text: 'Мы гуляли.' });

        expect(await readFile(path(DRAFT), 'utf8')).toMatch(RECORD);
    });

    it('rejects blank text and unknown arguments without writing', async () => {
        const { config, path } = await vaultWith({ [DRAFT]: 'keep' });

        await expect(diaryAppendTool(config, { text: '   ' })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(diaryAppendTool(config, {
            text: 'x',
            path: 'Other.md',
        })).rejects.toThrow('Unknown argument(s): path');
        expect(await readFile(path(DRAFT), 'utf8')).toBe('keep');
    });

    it('refuses to write through a symlinked folder', async () => {
        const { config, path } = await vaultWith({ '.obsidian/daily_note_draft.md': 'private' });

        await symlink(path('.obsidian'), path('@senaev'));

        await expect(diaryAppendTool(config, { text: 'x' })).rejects.toMatchObject({ code: 'forbidden_path' });
        expect(await readFile(path('.obsidian/daily_note_draft.md'), 'utf8')).toBe('private');
    });
});
