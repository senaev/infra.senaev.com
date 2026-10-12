import { readFile, readdir } from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { cloneCommand } from './cloneCommand';
import { createTestProjects, type TestProjects } from './createTestProjects';
import { listCommand } from './listCommand';
import { patchCommand } from './patchCommand';
import { projectsCommand } from './projectsCommand';
import { readCommand } from './readCommand';
import { runCommand } from './runCommand';
import { searchCommand } from './searchCommand';
import { writeCommand } from './writeCommand';

let projects: TestProjects;

beforeEach(async () => {
    projects = await createTestProjects({
        demo: {
            'sample.md': 'alpha\nbeta\n',
            'AGENTS.md': 'test rules',
        },
        source: { 'README.md': 'source' },
    });
});
afterEach(async () => {
    await projects.remove();
});

describe('standalone typed code commands', () => {
    it('runs all eight commands with explicit capabilities without a manager', async () => {
        const ownChanges: string[] = [];
        const ownLog = vi.fn();
        const execution = createCommandExecution({
            log: ownLog,
            changedPath: (path) => ownChanges.push(path),
        });
        const run = async () => {
            const discovered = await projectsCommand(projects.config, {}, execution);

            expect(discovered.projects.map((project) => project.name)).toEqual([
                'demo',
                'source',
            ]);
            const cloned = await cloneCommand(projects.config, {
                url: projects.path('source'),
                name: 'cloned',
            }, execution);

            expect(cloned).toMatchObject({
                project: 'cloned',
                branch: 'main',
            });
            const listed = await listCommand(projects.config, {
                project: 'demo',
                folder: '',
                glob: undefined,
                recursive: false,
                offset: 0,
                limit: 10,
            }, execution);

            expect(listed.entries.map((entry) => entry.path)).toContain('sample.md');
            const read = await readCommand(projects.config, {
                project: 'demo',
                paths: ['sample.md'],
                startLine: 1,
                lineCount: 1,
            }, execution);

            expect(read.files[0]).toMatchObject({
                content: 'alpha\n',
                hash: hashContent('alpha\nbeta\n'),
                nextStartLine: 2,
            });
            const search = await searchCommand(projects.config, {
                project: 'demo',
                queries: ['alpha'],
                regex: false,
                caseSensitive: false,
                contextLines: 0,
                glob: undefined,
                folder: '',
                maxMatchesPerFile: 3,
                offset: 0,
                limit: 10,
            }, execution);

            expect(search).toMatchObject({
                matchedFiles: 1,
                totalMatches: 1,
                files: [
                    {
                        path: 'sample.md',
                        snippet: '1:alpha',
                    },
                ],
            });
            const written = await writeCommand(projects.config, {
                project: 'demo',
                path: 'created.md',
                content: 'created\n',
                expectedHash: undefined,
            }, execution);
            const patched = await patchCommand(projects.config, {
                project: 'demo',
                path: 'created.md',
                expectedHash: written.hash,
                operations: [
                    {
                        find: 'created',
                        replace: 'changed',
                    },
                ],
            }, execution);

            expect(patched.hash).toBe(hashContent('changed\n'));
            await expect(patchCommand(projects.config, {
                project: 'demo',
                path: 'created.md',
                expectedHash: written.hash,
                operations: [
                    {
                        find: 'changed',
                        replace: 'stale',
                    },
                ],
            }, execution)).rejects.toMatchObject({ code: 'conflict' });
            await expect(patchCommand(projects.config, {
                project: 'demo',
                path: 'created.md',
                expectedHash: patched.hash,
                operations: [
                    {
                        find: 'changed',
                        replace: 'partial',
                    },
                    {
                        find: 'missing',
                        replace: 'bad',
                    },
                ],
            }, execution)).rejects.toMatchObject({ code: 'not_found' });
            expect(await readFile(projects.path('demo', 'created.md'), 'utf8')).toBe('changed\n');
            expect(ownChanges).toEqual([
                'cloned',
                'created.md',
                'created.md',
            ]);
            const command = await runCommand(projects.config, {
                project: 'demo',
                command: 'printf direct',
            }, execution);

            expect(command.stdout).toBe('direct');
            expect(ownLog).toHaveBeenCalledWith('stdout', 'direct');
            expect((await readdir(projects.config.projectsRoot)).some((path) => path.startsWith('.clone-'))).toBe(false);
        };

        await run();
    }, 30000);

    it('pre-aborted execution starts none of the seven migrated business commands', async () => {
        const controller = new AbortController();
        const reason = new Error('cancel before business work');
        const changedPath = vi.fn();
        const log = vi.fn();

        controller.abort(reason);
        const execution = createCommandExecution({
            signal: controller.signal,
            changedPath,
            log,
        });
        const commands = [
            () => projectsCommand(projects.config, {}, execution),
            () => cloneCommand(projects.config, {
                url: projects.path('source'),
                name: 'cancelled-clone',
            }, execution),
            () => listCommand(projects.config, {
                project: 'demo',
                folder: '',
                glob: undefined,
                recursive: false,
                offset: 0,
                limit: 10,
            }, execution),
            () => readCommand(projects.config, {
                project: 'demo',
                paths: ['sample.md'],
                startLine: 1,
                lineCount: 1,
            }, execution),
            () => searchCommand(projects.config, {
                project: 'demo',
                queries: ['alpha'],
                regex: false,
                caseSensitive: false,
                contextLines: 0,
                glob: undefined,
                folder: '',
                maxMatchesPerFile: 1,
                offset: 0,
                limit: 1,
            }, execution),
            () => writeCommand(projects.config, {
                project: 'demo',
                path: 'never.md',
                content: 'never',
                expectedHash: undefined,
            }, execution),
            () => patchCommand(projects.config, {
                project: 'demo',
                path: 'sample.md',
                expectedHash: hashContent('alpha\nbeta\n'),
                operations: [
                    {
                        find: 'alpha',
                        replace: 'never',
                    },
                ],
            }, execution),
        ];
        const results = await Promise.allSettled(commands.map((run) => run()));

        expect(results.every((result) => result.status === 'rejected' && result.reason === reason)).toBe(true);
        expect(changedPath).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
        expect((await readdir(projects.config.projectsRoot)).sort()).toEqual([
            'demo',
            'source',
        ]);
        expect((await readdir(projects.path('demo'))).sort()).toEqual([
            '.git',
            'AGENTS.md',
            'sample.md',
        ]);
        expect(await readFile(projects.path('demo', 'sample.md'), 'utf8')).toBe('alpha\nbeta\n');
    });

    it('keeps path protections when typed commands are called without the input adapter', async () => {
        const execution = createCommandExecution();

        await expect(writeCommand(projects.config, {
            project: 'demo',
            path: '../outside',
            content: 'bad',
            expectedHash: undefined,
        }, execution)).rejects.toMatchObject({ code: 'forbidden_path' });
        await expect(readCommand(projects.config, {
            project: 'demo',
            paths: ['.git/config'],
            startLine: 1,
            lineCount: 10,
        }, execution)).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});
