import { readFile, readdir } from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { createTestVault, type TestVault } from './createTestVault';
import { createCommand } from './tools/createCommand';
import { diaryAppendCommand } from './tools/diaryAppendCommand';
import { linksCommand } from './tools/linksCommand';
import { listCommand } from './tools/listCommand';
import { moveCommand } from './tools/moveCommand';
import { patchCommand } from './tools/patchCommand';
import { readCommand } from './tools/readCommand';
import { searchCommand } from './tools/searchCommand';

let vault: TestVault;
const scope = {
    folder: '',
    matchesGlob: null,
    diaryFrom: undefined,
    diaryTo: undefined,
};
const readInput = {
    paths: ['Source.md'],
    diaryFrom: undefined,
    diaryTo: undefined,
    section: undefined,
    startChar: 0,
    lineNumbers: false,
};
const searchInput = {
    scope,
    queries: ['original'],
    wholeWord: false,
    requireAll: false,
    contextLines: 0,
    maxMatchesPerFile: 10,
    sort: 'path' as const,
    offset: 0,
    limit: 10,
};

afterEach(async () => {
    await vault?.remove();
});

describe('standalone typed Obsidian commands', { timeout: 30000 }, () => {
    it('runs all eight commands with explicit capabilities without a manager', async () => {
        const original = '---\ntitle: Source\n---\n# Heading\noriginal\n';

        vault = await createTestVault({
            'Source.md': original,
            'Backlink.md': '[[Source]]',
            '@senaev/daily_note_stream.md': '',
        });
        const ownChanges: string[] = [];

        const execution = createCommandExecution({ changedPath: (path) => ownChanges.push(path) });
        const run = async () => {
            const listed = await listCommand(vault.config, {
                scope,
                recursive: true,
                offset: 0,
                limit: 1,
            }, execution);

            expect(listed.total).toBe(3);
            expect(listed.nextOffset).toBe(1);
            const read = await readCommand(vault.config, {
                ...readInput,
                section: 'Heading',
                startChar: 2,
            }, execution);

            expect(read.notes[0]?.hash).toBe(hashContent(original));
            expect(read.notes[0]?.startChar).toBe(2);
            expect(read.notes[0]?.content).toContain('original');
            const search = await searchCommand(vault.config, searchInput, execution);

            expect(search.matchedFiles).toBe(1);
            expect(search.files[0]?.path).toBe('Source.md');
            const links = await linksCommand(vault.config, {
                path: 'Source.md',
                direction: 'both',
                offset: 0,
                limit: 10,
            }, execution);

            expect(links.backlinks?.totalLinks).toBe(1);
            const content = '# Heading\nold\n\n# Other\nother\n[[Source]]\n';

            await createCommand(vault.config, {
                path: 'Created',
                content,
                frontmatter: undefined,
            }, execution);
            await expect(createCommand(vault.config, {
                path: 'Created',
                content: 'overwrite',
                frontmatter: undefined,
            }, execution)).rejects.toMatchObject({ code: 'already_exists' });
            await patchCommand(vault.config, {
                path: 'Created.md',
                expectedHash: hashContent(content),
                operations: [
                    {
                        type: 'replace',
                        find: 'old',
                        replace: 'new',
                    },
                    {
                        type: 'append',
                        text: 'more',
                        section: 'Heading',
                    },
                    {
                        type: 'replaceSection',
                        section: 'Other',
                        content: 'changed\n[[Source]]',
                    },
                    {
                        type: 'setFrontmatter',
                        properties: { title: 'Created' },
                    },
                ],
            }, execution);
            const updated = await readFile(vault.path('Created.md'), 'utf8');

            expect(updated).toContain('title: Created');
            expect(updated).toContain('new\nmore');
            await expect(patchCommand(vault.config, {
                path: 'Created.md',
                expectedHash: hashContent(content),
                operations: [
                    {
                        type: 'append',
                        text: 'bad',
                        section: undefined,
                    },
                ],
            }, execution)).rejects.toMatchObject({ code: 'conflict' });
            await expect(patchCommand(vault.config, {
                path: 'Created.md',
                expectedHash: hashContent(updated),
                operations: [
                    {
                        type: 'replace',
                        find: 'new',
                        replace: 'unpublished',
                    },
                    {
                        type: 'replace',
                        find: 'missing text',
                        replace: 'bad',
                    },
                ],
            }, execution)).rejects.toMatchObject({ code: 'not_found' });
            expect(await readFile(vault.path('Created.md'), 'utf8')).toBe(updated);
            const moved = await moveCommand(vault.config, {
                path: 'Source.md',
                newPath: 'Moved',
            }, execution);

            expect(moved.rewrittenLinks).toBe(2);
            expect(await readFile(vault.path('Backlink.md'), 'utf8')).toBe('[[Moved]]');
            expect(await readFile(vault.path('Moved.md'), 'utf8')).toBe(original);
            await expect(readFile(vault.path('Source.md'))).rejects.toMatchObject({ code: 'ENOENT' });
            await diaryAppendCommand(vault.config, { text: 'standalone diary record' }, execution);
            expect(await readFile(vault.path(vault.config.diaryDraftPath), 'utf8')).toContain('standalone diary record');
            expect(ownChanges).toEqual([
                'Created.md',
                'Created.md',
                'Moved.md',
                'Backlink.md',
                'Created.md',
                'Source.md',
                '@senaev/daily_note_stream.md',
            ]);
        };

        await run();
    });

    it('rejects every pre-aborted command without touching files or reporting changes', async () => {
        vault = await createTestVault({ 'Source.md': 'original' });
        const controller = new AbortController();
        const reason = Object.assign(new Error('cancelled'), { code: 'ENOENT' });

        controller.abort(reason);
        const changedPath = vi.fn();
        const execution = createCommandExecution({
            signal: controller.signal,
            changedPath,
        });
        const commands = [
            () => listCommand(vault.config, {
                scope,
                recursive: true,
                offset: 0,
                limit: 10,
            }, execution),
            () => readCommand(vault.config, readInput, execution),
            () => searchCommand(vault.config, searchInput, execution),
            () => linksCommand(vault.config, {
                path: 'Source.md',
                direction: 'both',
                offset: 0,
                limit: 10,
            }, execution),
            () => createCommand(vault.config, {
                path: 'new/note',
                content: 'bad',
                frontmatter: undefined,
            }, execution),
            () => patchCommand(vault.config, {
                path: 'Source.md',
                expectedHash: hashContent('original'),
                operations: [
                    {
                        type: 'replace',
                        find: 'original',
                        replace: 'bad',
                    },
                ],
            }, execution),
            () => moveCommand(vault.config, {
                path: 'Source.md',
                newPath: 'new/moved',
            }, execution),
            () => diaryAppendCommand(vault.config, { text: 'bad' }, execution),
        ];

        for (const run of commands) {
            await expect(run()).rejects.toBe(reason);
        }

        expect(changedPath).not.toHaveBeenCalled();
        expect(await readdir(vault.config.root)).toEqual(['Source.md']);
        expect(await readFile(vault.path('Source.md'), 'utf8')).toBe('original');
    });

    it('uses explicit cancellation after publication and releases the move reservation', async () => {
        vault = await createTestVault({
            'Source.md': 'original',
            'Backlink.md': '[[Source]]',
        });
        const controller = new AbortController();
        const reason = new Error('cancelled after publication');
        const changes: string[] = [];
        const execution = createCommandExecution({
            signal: controller.signal,
            changedPath: (path) => {
                changes.push(path);
                if (path === 'Target.md') {
                    controller.abort(reason);
                }
            },
        });

        await expect(moveCommand(vault.config, {
            path: 'Source.md',
            newPath: 'Target',
        }, execution)).rejects.toBe(reason);
        expect(changes).toEqual(['Target.md']);
        expect(await readFile(vault.path('Target.md'), 'utf8')).toBe('original');
        expect(await readFile(vault.path('Source.md'), 'utf8')).toBe('original');
        expect(await readFile(vault.path('Backlink.md'), 'utf8')).toBe('[[Source]]');
        await moveCommand(vault.config, {
            path: 'Source.md',
            newPath: 'Other',
        }, createCommandExecution());
        expect(await readFile(vault.path('Backlink.md'), 'utf8')).toBe('[[Other]]');
    });

    it('retains path and exclusion guards for direct typed calls', async () => {
        vault = await createTestVault({
            'Source.md': 'original',
            '.hidden/Secret.md': 'secret',
        });
        const execution = createCommandExecution();

        await expect(listCommand(vault.config, {
            scope: {
                ...scope,
                folder: '../outside',
            },
            recursive: true,
            offset: 0,
            limit: 10,
        }, execution)).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(createCommand(vault.config, {
            path: '../outside',
            content: 'bad',
            frontmatter: undefined,
        }, execution)).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(readCommand(vault.config, {
            ...readInput,
            paths: ['.hidden/Secret.md'],
        }, execution)).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});
