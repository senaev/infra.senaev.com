import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { listTool } from './listTool';

let vault: TestVault;

beforeAll(async () => {
    vault = await createTestVault({
        'Apache.md': '',
        'places/cities/Madrid.md': '',
        'places/Retiro.md': '',
        'periodic/day/2025-12-31.md': '',
        'periodic/day/2026-01-01.md': '',
        'periodic/day/2026-01-02.md': '',
        'periodic/day/notes about days.md': '',
        'periodic/month/2026-01.md': '',
    });
});

afterAll(async () => {
    await vault.remove();
});

function paths(result: Awaited<ReturnType<typeof listTool>>): string[] {
    return result.entries.map((entry) => entry.path);
}

describe('listTool', () => {
    it('lists one folder level, folders first', async () => {
        expect(paths(await listTool(vault.config, { folder: 'places' }))).toEqual([
            'places/cities',
            'places/Retiro.md',
        ]);
    });

    it('filters by a file name glob at any depth', async () => {
        expect(paths(await listTool(vault.config, { glob: 'm*.md' }))).toEqual(['places/cities/Madrid.md']);
        expect(paths(await listTool(vault.config, { glob: 'places/**/*.md' }))).toEqual([
            'places/cities/Madrid.md',
            'places/Retiro.md',
        ]);
    });

    it('lists diary entries in a date range, ignoring other files in the diary folder', async () => {
        const result = await listTool(vault.config, {
            diaryFrom: '2026-01-01',
            diaryTo: '2026-01-31',
        });

        expect(result.entries).toEqual([
            expect.objectContaining({
                path: 'periodic/day/2026-01-01.md',
                diaryDate: '2026-01-01',
            }),
            expect.objectContaining({
                path: 'periodic/day/2026-01-02.md',
                diaryDate: '2026-01-02',
            }),
        ]);
    });

    it('pages through the results', async () => {
        const first = await listTool(vault.config, {
            recursive: true,
            limit: 3,
        });
        const second = await listTool(vault.config, {
            recursive: true,
            limit: 3,
            offset: first.nextOffset,
        });
        const third = await listTool(vault.config, {
            recursive: true,
            limit: 3,
            offset: second.nextOffset,
        });

        expect(first.total).toBe(8);
        expect([
            first.nextOffset,
            second.nextOffset,
            third.nextOffset,
        ]).toEqual([
            3,
            6,
            null,
        ]);
        expect(new Set([
            ...paths(first),
            ...paths(second),
            ...paths(third),
        ]).size).toBe(8);
    });

    it('rejects an impossible date and a reversed range', async () => {
        await expect(listTool(vault.config, { diaryFrom: '2026-02-30' })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(listTool(vault.config, {
            diaryFrom: '2026-02-01',
            diaryTo: '2026-01-01',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });

    it('reports a missing folder', async () => {
        await expect(listTool(vault.config, { folder: 'nowhere' })).rejects.toMatchObject({ code: 'not_found' });
    });
});
