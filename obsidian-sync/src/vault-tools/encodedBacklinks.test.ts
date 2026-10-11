import { readFile } from 'node:fs/promises';

import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from './createTestVault';
import { linksTool } from './tools/linksTool';
import { moveTool } from './tools/moveTool';

let vault: TestVault | undefined;

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

describe('encoded backlinks', () => {
    it.each([
        [
            'Target.md',
            '[ref](T%61rget.md)',
        ],
        [
            'Заметка.md',
            '[ref](%D0%97аметка.md)',
        ],
        [
            'Target space.md',
            '[ref](Target%20space.md)',
        ],
    ])('finds and rewrites a partially encoded link to %s', async (path, content) => {
        vault = await createTestVault({
            [path]: 'original',
            'Backlink.md': content,
        });
        const before = await linksTool(vault.config, {
            path,
            direction: 'backlinks',
        });

        expect(before.backlinks?.totalLinks).toBe(1);
        const moved = await moveTool(vault.config, {
            path,
            newPath: 'Moved.md',
        });

        expect(moved.rewrittenLinks).toBe(1);
        const after = await linksTool(vault.config, {
            path: 'Moved.md',
            direction: 'backlinks',
        });

        expect(after.backlinks?.totalLinks).toBe(1);
        expect(await readFile(vault.path('Backlink.md'), 'utf8')).toContain('Moved');
    });
});
