import { chmod } from 'node:fs/promises';

import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { searchTool } from './searchTool';

let vault: TestVault | undefined;

async function vaultWith(files: Record<string, string>): Promise<TestVault> {
    vault = await createTestVault(files);

    return vault;
}

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

describe('searchTool', () => {
    it('scans the whole scope even when the response limit is reached', async () => {
        const files = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [
            `notes/note-${String(index).padStart(2, '0')}.md`,
            'climbing gym',
        ]));
        const { config } = await vaultWith(files);

        const result = await searchTool(config, {
            queries: ['climbing'],
            limit: 5,
        });

        expect(result).toMatchObject({
            scannedFiles: 30,
            matchedFiles: 30,
            totalHits: 30,
            nextOffset: 5,
            truncated: true,
            complete: true,
        });
        expect(result.files).toHaveLength(5);

        const lastPage = await searchTool(config, {
            queries: ['climbing'],
            limit: 5,
            offset: 25,
        });

        expect(lastPage).toMatchObject({
            nextOffset: null,
            truncated: false,
        });
    });

    it('matches several literal queries in one pass and tells which matched where', async () => {
        const { config } = await vaultWith({
            'a.md': 'Went to the Climbing gym\nthen ate köfte',
            'b.md': 'only köfte here',
            'c.md': 'nothing',
        });

        const any = await searchTool(config, {
            queries: [
                'climbing',
                'KÖFTE',
            ],
        });
        const all = await searchTool(config, {
            queries: [
                'climbing',
                'köfte',
            ],
            match: 'all',
        });

        expect(any.files.map((file) => [
            file.path,
            file.matchedQueries,
        ])).toEqual([
            [
                'a.md',
                [
                    'climbing',
                    'KÖFTE',
                ],
            ],
            [
                'b.md',
                ['KÖFTE'],
            ],
        ]);
        expect(all.files.map((file) => file.path)).toEqual(['a.md']);
        expect(all.files[0]?.matches.map((match) => [
            match.line,
            match.queries,
        ])).toEqual([
            [
                1,
                ['climbing'],
            ],
            [
                2,
                ['köfte'],
            ],
        ]);
    });

    it('treats queries as literal text, never as patterns', async () => {
        const { config } = await vaultWith({
            'a.md': 'version a.b and (x+y)',
            'b.md': 'version axb',
        });

        const result = await searchTool(config, {
            queries: [
                'a.b',
                '(x+y)',
            ],
        });

        expect(result.files.map((file) => file.path)).toEqual(['a.md']);
    });

    it('matches whole words only when asked, also in Cyrillic', async () => {
        const { config } = await vaultWith({
            'a.md': 'Мы гуляли с собакой',
            'b.md': 'собака спит',
        });

        const substring = await searchTool(config, { queries: ['собак'] });
        const wholeWord = await searchTool(config, {
            queries: ['собака'],
            wholeWord: true,
        });

        expect(substring.matchedFiles).toBe(2);
        expect(wholeWord.files.map((file) => file.path)).toEqual(['b.md']);
    });

    it('matches note titles, and ranks them above body-only matches', async () => {
        const { config } = await vaultWith({
            'Beckham Law.md': 'about taxes',
            'Taxes in Spain.md': 'see Beckham',
        });

        const result = await searchTool(config, { queries: ['beckham'] });

        expect(result.files.map((file) => [
            file.path,
            file.titleMatched,
        ])).toEqual([
            [
                'Beckham Law.md',
                true,
            ],
            [
                'Taxes in Spain.md',
                false,
            ],
        ]);
    });

    it('returns surrounding context and limits the matches per file', async () => {
        const { config } = await vaultWith({ 'a.md': 'zero\nhit one\ntwo\nhit three\nhit four' });

        const result = await searchTool(config, {
            queries: ['hit'],
            maxMatchesPerFile: 2,
            contextLines: 1,
        });

        expect(result.files[0]).toMatchObject({
            hitCount: 3,
            omittedMatches: 1,
            matches: [
                {
                    line: 2,
                    text: 'hit one',
                    before: ['zero'],
                    after: ['two'],
                },
                {
                    line: 4,
                    text: 'hit three',
                    before: ['two'],
                    after: ['hit four'],
                },
            ],
        });
        expect(result.truncated).toBe(true);
    });

    it('limits a search to a diary range and sorts it by date', async () => {
        const { config } = await vaultWith({
            'periodic/day/2025-01-02.md': 'gym',
            'periodic/day/2025-01-01.md': 'gym gym',
            'periodic/day/2025-02-01.md': 'gym',
            'periodic/month/2025-01.md': 'gym',
        });

        const result = await searchTool(config, {
            queries: ['gym'],
            diaryFrom: '2025-01-01',
            diaryTo: '2025-01-31',
        });

        expect(result.sort).toBe('path');
        expect(result.files.map((file) => [
            file.path,
            file.diaryDate,
        ])).toEqual([
            [
                'periodic/day/2025-01-01.md',
                '2025-01-01',
            ],
            [
                'periodic/day/2025-01-02.md',
                '2025-01-02',
            ],
        ]);
    });

    it('reports unreadable files and marks the scan incomplete', async () => {
        const { config, path } = await vaultWith({
            'ok.md': 'word',
            'locked.md': 'word',
        });

        await chmod(path('locked.md'), 0o000);

        const result = await searchTool(config, { queries: ['word'] });

        await chmod(path('locked.md'), 0o644);

        expect(result).toMatchObject({
            scannedFiles: 2,
            matchedFiles: 1,
            complete: false,
            readErrorCount: 1,
            readErrors: [{ path: 'locked.md' }],
        });
    });

    it('reduces a too-large limit to the maximum and reports the limit it used', async () => {
        const files = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [
            `n${String(index).padStart(2, '0')}.md`,
            'gym',
        ]));
        const { config } = await vaultWith(files);

        const result = await searchTool(config, {
            queries: ['gym'],
            limit: 100,
        });

        expect(result).toMatchObject({
            limit: 50,
            matchedFiles: 60,
            nextOffset: 50,
        });
        expect(result.files).toHaveLength(50);
        await expect(searchTool(config, {
            queries: ['gym'],
            limit: 0,
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(searchTool(config, {
            queries: ['gym'],
            limit: '100',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });

    it('rejects missing queries and unknown arguments', async () => {
        const { config } = await vaultWith({});

        await expect(searchTool(config, {})).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(searchTool(config, {
            queries: ['x'],
            regex: true,
        })).rejects.toThrow('Unknown argument(s): regex');
    });
});
