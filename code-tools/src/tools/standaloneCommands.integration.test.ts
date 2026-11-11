import { readFile, readdir } from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createTestProjects, type TestProjects } from './createTestProjects';
import { listCommand } from './listCommand';
import { patchCommand } from './patchCommand';
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
    it('runs all six commands with explicit capabilities without a manager', async () => {
        const ownChanges: string[] = [];
        const ownLog = vi.fn();
        const execution = createCommandExecution({
            log: ownLog,
            changedPath: (path) => ownChanges.push(path),
        });
        const listed = await listCommand(projects.config, {
            folder: projects.path('demo'),
            glob: undefined,
            recursive: false,
            offset: 0,
            limit: 10,
        }, execution);

        expect(listed.entries.map((entry) => entry.path)).toContain(projects.path('demo', 'sample.md'));
        const read = await readCommand(projects.config, {
            paths: [projects.path('demo', 'sample.md')],
            startLine: 1,
            lineCount: 1,
        }, execution);

        expect(read.files[0]).toMatchObject({
            content: 'alpha\n',
            hash: hashContent('alpha\nbeta\n'),
            nextStartLine: 2,
        });
        const search = await searchCommand(projects.config, {
            folder: projects.path('demo'),
            queries: ['alpha'],
            regex: false,
            caseSensitive: false,
            contextLines: 0,
            glob: undefined,
            maxMatchesPerFile: 3,
            offset: 0,
            limit: 10,
        }, execution);

        expect(search).toMatchObject({
            matchedFiles: 1,
            totalMatches: 1,
            files: [
                {
                    path: projects.path('demo', 'sample.md'),
                    snippet: '1:alpha',
                },
            ],
        });
        const created = projects.path('demo', 'created.md');
        const written = await writeCommand(projects.config, {
            path: created,
            content: 'created\n',
            expectedHash: undefined,
        }, execution);
        const patched = await patchCommand(projects.config, {
            path: created,
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
            path: created,
            expectedHash: written.hash,
            operations: [
                {
                    find: 'changed',
                    replace: 'stale',
                },
            ],
        }, execution)).rejects.toMatchObject({ code: 'conflict' });
        await expect(patchCommand(projects.config, {
            path: created,
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
        expect(await readFile(created, 'utf8')).toBe('changed\n');
        expect(ownChanges).toEqual([
            created,
            created,
        ]);
        const command = await runCommand(projects.config, {
            cwd: projects.path('demo'),
            command: 'printf direct',
        }, execution);

        expect(command).toMatchObject({
            cwd: projects.path('demo'),
            stdout: 'direct',
        });
        expect(ownLog).toHaveBeenCalledWith('stdout', 'direct');
    }, 30000);

    it('pre-aborted execution starts none of the six business commands', async () => {
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
            () => listCommand(projects.config, {
                folder: projects.path('demo'),
                glob: undefined,
                recursive: false,
                offset: 0,
                limit: 10,
            }, execution),
            () => readCommand(projects.config, {
                paths: [projects.path('demo', 'sample.md')],
                startLine: 1,
                lineCount: 1,
            }, execution),
            () => searchCommand(projects.config, {
                folder: projects.path('demo'),
                queries: ['alpha'],
                regex: false,
                caseSensitive: false,
                contextLines: 0,
                glob: undefined,
                maxMatchesPerFile: 1,
                offset: 0,
                limit: 1,
            }, execution),
            () => writeCommand(projects.config, {
                path: projects.path('demo', 'never.md'),
                content: 'never',
                expectedHash: undefined,
            }, execution),
            () => patchCommand(projects.config, {
                path: projects.path('demo', 'sample.md'),
                expectedHash: hashContent('alpha\nbeta\n'),
                operations: [
                    {
                        find: 'alpha',
                        replace: 'never',
                    },
                ],
            }, execution),
            () => runCommand(projects.config, {
                cwd: projects.path('demo'),
                command: 'touch never-run',
            }, execution),
        ];
        const results = await Promise.allSettled(commands.map((run) => run()));

        expect(results.every((result) => result.status === 'rejected' && result.reason === reason)).toBe(true);
        expect(changedPath).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
        expect((await readdir(projects.root)).sort()).toEqual([
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

    it('validates paths when typed commands are called without the input adapter', async () => {
        const execution = createCommandExecution();

        await expect(writeCommand(projects.config, {
            path: 'demo/relative.md',
            content: 'bad',
            expectedHash: undefined,
        }, execution)).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(readCommand(projects.config, {
            paths: [`${projects.path('demo')}\0/sample.md`],
            startLine: 1,
            lineCount: 10,
        }, execution)).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(listCommand(projects.config, {
            folder: 'demo',
            glob: undefined,
            recursive: false,
            offset: 0,
            limit: 10,
        }, execution)).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(runCommand(projects.config, {
            cwd: projects.path('missing'),
            command: 'true',
        }, execution)).rejects.toMatchObject({ code: 'not_found' });
        expect((await readdir(projects.root)).sort()).toEqual([
            'demo',
            'source',
        ]);
    });
});
