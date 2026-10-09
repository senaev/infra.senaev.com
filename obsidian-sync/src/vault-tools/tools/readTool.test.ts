import { readFile } from 'node:fs/promises';

import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';
import { hashContent } from '../markdown/parseMarkdown';

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

const NOTE = [
    '---',
    'aliases: [Plans]',
    'birthday: 2020-08-20',
    '---',
    '# Year',
    '',
    '## Week 1',
    '',
    '### Notes',
    'first week',
    '',
    '## Week 2',
    '',
    '### Notes',
    'second week',
    '',
].join('\n');

describe('readTool', () => {
    it('returns the body, the parsed frontmatter and the hash of the whole file', async () => {
        const { config, path } = await vaultWith({ 'Note.md': NOTE });

        const [note] = (await readTool(config, { paths: ['Note.md'] })).notes;

        expect(note).toMatchObject({
            path: 'Note.md',
            hash: hashContent(await readFile(path('Note.md'), 'utf8')),
            frontmatter: {
                aliases: ['Plans'],
                birthday: '2020-08-20',
            },
            truncated: false,
        });
        expect(note?.content.startsWith('# Year')).toBe(true);
    });

    it('reads one section by a heading path, and rejects an ambiguous heading', async () => {
        const { config } = await vaultWith({ 'Note.md': NOTE });

        const result = await readTool(config, {
            paths: ['Note.md'],
            section: 'Week 2 > Notes',
        });

        expect(result.notes[0]).toMatchObject({
            content: '### Notes\nsecond week\n',
            section: {
                headingPath: 'Year > Week 2 > Notes',
                startLine: 14,
            },
        });
        await expect(readTool(config, {
            paths: ['Note.md'],
            section: 'Notes',
        })).rejects.toMatchObject({
            code: 'ambiguous',
            details: {
                candidates: [
                    expect.objectContaining({ headingPath: 'Year > Week 1 > Notes' }),
                    expect.objectContaining({ headingPath: 'Year > Week 2 > Notes' }),
                ],
            },
        });
    });

    it('cuts only a note larger than the per-note limit, says so, and can continue it', async () => {
        const { config } = await vaultWith({ 'Big.md': 'x'.repeat(25_000) });

        const first = await readTool(config, { paths: ['Big.md'] });
        const rest = await readTool(config, {
            paths: ['Big.md'],
            startChar: first.notes[0]?.nextStartChar,
        });

        expect(first.notes[0]).toMatchObject({
            truncated: true,
            totalChars: 25_000,
            nextStartChar: 20_000,
        });
        expect(rest.notes[0]).toMatchObject({
            truncated: false,
            startChar: 20_000,
        });
        expect(rest.notes[0]?.content).toHaveLength(5_000);
    });

    it('stops at the response budget and names the notes it did not return', async () => {
        const { config } = await vaultWith({
            'a.md': 'a'.repeat(12_000),
            'b.md': 'b'.repeat(12_000),
            'c.md': 'c'.repeat(12_000),
        });

        const result = await readTool(config, {
            paths: [
                'a.md',
                'b.md',
                'c.md',
            ],
        });

        expect(result.notes.map((note) => [
            note.path,
            note.truncated,
        ])).toEqual([
            [
                'a.md',
                false,
            ],
            [
                'b.md',
                false,
            ],
        ]);
        expect(result).toMatchObject({
            complete: false,
            remainingPaths: ['c.md'],
        });
    });

    it('reads a diary range in date order and tells where to continue', async () => {
        const { config } = await vaultWith({
            'periodic/day/2026-01-01.md': 'a'.repeat(14_000),
            'periodic/day/2026-01-02.md': 'b'.repeat(14_000),
            'periodic/day/2026-01-03.md': 'c'.repeat(14_000),
            'periodic/day/2026-02-01.md': 'outside',
        });

        const first = await readTool(config, {
            diaryFrom: '2026-01-01',
            diaryTo: '2026-01-31',
        });
        const second = await readTool(config, {
            diaryFrom: first.nextDiaryFrom,
            diaryTo: '2026-01-31',
        });

        expect(first.notes.map((note) => note.diaryDate)).toEqual([
            '2026-01-01',
            '2026-01-02',
        ]);
        expect(first.nextDiaryFrom).toBe('2026-01-03');
        expect(second.notes.map((note) => note.diaryDate)).toEqual(['2026-01-03']);
        expect(second).toMatchObject({
            complete: true,
            nextDiaryFrom: null,
        });
    });

    it('reports a missing note among several without failing the others', async () => {
        const { config } = await vaultWith({ 'a.md': 'a' });

        const result = await readTool(config, {
            paths: [
                'a.md',
                'missing.md',
            ],
        });

        expect(result.notes.map((note) => note.path)).toEqual(['a.md']);
        expect(result.errors).toEqual([
            expect.objectContaining({
                path: 'missing.md',
                code: 'not_found',
            }),
        ]);
    });

    it('keeps a broken frontmatter block visible instead of dropping it', async () => {
        const { config } = await vaultWith({ 'a.md': '---\nkey: [unclosed\n---\nbody\n' });

        const [note] = (await readTool(config, { paths: ['a.md'] })).notes;

        expect(note).toMatchObject({
            frontmatter: null,
            frontmatterRaw: 'key: [unclosed',
            content: 'body\n',
        });
        expect(note?.frontmatterError).toBeTruthy();
    });
});
