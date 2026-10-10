import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { linksTool } from './linksTool';

let vault: TestVault;

beforeAll(async () => {
    vault = await createTestVault({
        '_people/@luli.md': '---\naliases: [Luli, Юля]\n---\n# Luli\nMarried to [[@senaev]].\n',
        '_people/@senaev.md': '# Andrei\nSee [[Flex]] and [[Nowhere#Plans]] and ![[photo.png]] and [site](https://senaev.com).\n',
        'periodic/day/2026-10-07.md': 'Talked with [[@luli|Luli]] about [[@luli#Plans]].\n```\n[[@luli]]\n```\n',
        'periodic/day/2026-10-08.md': 'Dinner with [Luli](../../_people/%40luli.md) and ![[@luli#^quote]].\n',
        'periodic/day/2026-10-09.md': 'Called [[Юля]] in the evening.\n',
        'work/DataDog/Flex.md': '# Flex at DataDog\n',
        'work/Yandex/Flex.md': '# Flex at Yandex\n',
        'Unrelated.md': 'Nothing to see.\n',
        '_Resources/photo.png': 'binary',
        '.trash/@luli old.md': 'Mentions [[@luli]] from the trash.\n',
    });
});

afterAll(async () => {
    await vault.remove();
});

describe('linksTool', () => {
    it('resolves outgoing links and reports ambiguous, unresolved and external ones', async () => {
        const result = await linksTool(vault.config, {
            path: '_people/@senaev.md',
            direction: 'outgoing',
        });

        expect(result.outgoing?.items.map((link) => [
            link.raw,
            link.resolution,
        ])).toEqual([
            [
                '[[Flex]]',
                {
                    status: 'ambiguous',
                    candidates: [
                        'work/DataDog/Flex.md',
                        'work/Yandex/Flex.md',
                    ],
                },
            ],
            [
                '[[Nowhere#Plans]]',
                { status: 'unresolved' },
            ],
            [
                '![[photo.png]]',
                {
                    status: 'resolved',
                    path: '_Resources/photo.png',
                },
            ],
            [
                '[site](https://senaev.com)',
                {
                    status: 'external',
                    url: 'https://senaev.com',
                },
            ],
        ]);
        expect(result.backlinks).toBeNull();
    });

    it('finds backlinks of every link form by scanning the vault, but not in code or excluded folders', async () => {
        const result = await linksTool(vault.config, {
            path: '_people/@luli.md',
            direction: 'backlinks',
        });

        // 2026-10-07: the alias link and the heading link count, the one in the code block
        // does not. 2026-10-08: the Markdown link and the block embed both count.
        expect(result.backlinks).toEqual({
            totalSources: 2,
            totalLinks: 4,
            offset: 0,
            limit: 100,
            nextOffset: null,
            sources: [
                {
                    source: 'periodic/day/2026-10-07.md',
                    diaryDate: '2026-10-07',
                    count: 2,
                    lines: [
                        1,
                        1,
                    ],
                },
                {
                    source: 'periodic/day/2026-10-08.md',
                    diaryDate: '2026-10-08',
                    count: 2,
                    lines: [
                        1,
                        1,
                    ],
                },
            ],
        });
        expect(result.aliasBacklinks?.items).toEqual([
            expect.objectContaining({
                source: 'periodic/day/2026-10-09.md',
                raw: '[[Юля]]',
                candidates: ['_people/@luli.md'],
            }),
        ]);
        expect(result).toMatchObject({
            scannedFiles: 8,
            complete: true,
        });
    });

    it('reports backlinks that only might point at the note as ambiguous', async () => {
        const result = await linksTool(vault.config, {
            path: 'work/Yandex/Flex.md',
            direction: 'backlinks',
        });

        expect(result.backlinks?.totalLinks).toBe(0);
        expect(result.ambiguousBacklinks?.items).toEqual([
            expect.objectContaining({
                source: '_people/@senaev.md',
                raw: '[[Flex]]',
            }),
        ]);
    });

    it('returns both directions by default', async () => {
        const result = await linksTool(vault.config, { path: '_people/@luli.md' });

        expect(result.outgoing?.items.map((link) => link.resolution)).toEqual([
            {
                status: 'resolved',
                path: '_people/@senaev.md',
            },
        ]);
        expect(result.backlinks?.totalLinks).toBe(4);
    });

    it('pages through the linking notes', async () => {
        const first = await linksTool(vault.config, {
            path: '_people/@luli.md',
            direction: 'backlinks',
            limit: 1,
        });
        const second = await linksTool(vault.config, {
            path: '_people/@luli.md',
            direction: 'backlinks',
            limit: 1,
            offset: first.backlinks?.nextOffset,
        });

        expect(first.backlinks?.sources.map((source) => source.source)).toEqual(['periodic/day/2026-10-07.md']);
        expect(second.backlinks).toMatchObject({
            nextOffset: null,
            sources: [{ source: 'periodic/day/2026-10-08.md' }],
        });
    });

    it('rejects a missing or excluded note', async () => {
        await expect(linksTool(vault.config, { path: 'Missing.md' })).rejects.toMatchObject({ code: 'not_found' });
        await expect(linksTool(vault.config, { path: '.trash/@luli old.md' })).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});
