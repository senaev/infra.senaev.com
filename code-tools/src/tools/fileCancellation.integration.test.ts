import {
    readFile, readdir, writeFile,
} from 'node:fs/promises';

import { type CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withCommandExecution } from 'senaev-utils/src/commands/testing/withCommandExecution';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createTestProjects, type TestProjects } from './createTestProjects';
import { patchTool } from './patchTool';
import { readTool } from './readTool';
import { writeTool } from './writeTool';

const hooks = vi.hoisted(() => {
    return {
        afterWrite: (_path: string) => Promise.resolve(),
        afterRename: () => undefined as void,
        beforeRead: (_path: string) => undefined as void,
        afterRead: (_path: string) => undefined as void,
    };
});

vi.mock('node:fs/promises', async (importOriginal) => {
    const original = await importOriginal<typeof import('node:fs/promises')>();

    return {
        ...original,
        open: async (...args: Parameters<typeof original.open>) => {
            const handle = await original.open(...args);
            const write = handle.writeFile.bind(handle);

            handle.writeFile = async (...writeArgs: Parameters<typeof handle.writeFile>) => {
                await write(...writeArgs);
                await hooks.afterWrite(String(args[0]));
            };

            return handle;
        },
        rename: async (...args: Parameters<typeof original.rename>) => {
            await original.rename(...args);
            hooks.afterRename();
        },
        readFile: async (...args: Parameters<typeof original.readFile>) => {
            hooks.beforeRead(String(args[0]));
            const result = await original.readFile(...args);

            hooks.afterRead(String(args[0]));

            return result;
        },
    };
});

describe('cooperative file cancellation and atomicity', () => {
    let projects: TestProjects;

    beforeEach(async () => {
        projects = await createTestProjects({
            demo: {
                'README.md': 'old\n',
                'second.md': 'second',
            },
        });
    });
    afterEach(async () => {
        hooks.afterWrite = () => Promise.resolve();
        hooks.afterRename = () => undefined;
        hooks.beforeRead = () => undefined;
        hooks.afterRead = () => undefined;
        await projects.remove();
    });
    function context(controller = new AbortController()) {
        return {
            signal: controller.signal,
            changedPaths: new Set<string>(),
            log: () => undefined,
        };
    }

    it('all four handlers stop before work for an already aborted signal', async () => {
        const controller = new AbortController();
        const reason = new Error('cancelled');

        controller.abort(reason);
        const calls = [
            (execution: CommandExecution) => readTool(projects.config, {
                project: 'demo',
                paths: ['README.md'],
            }, execution),
            (execution: CommandExecution) => writeTool(projects.config, {
                project: 'demo',
                path: 'README.md',
                content: 'new',
            }, execution),
            (execution: CommandExecution) => patchTool(projects.config, {
                project: 'demo',
                path: 'README.md',
                expectedHash: hashContent('old\n'),
                operations: [
                    {
                        find: 'old',
                        replace: 'new',
                    },
                ],
            }, execution),
        ];

        for (const run of calls) {
            await expect(withCommandExecution<unknown>(context(controller), run)).rejects.toBe(reason);
        }

        expect(await readFile(projects.path('demo', 'README.md'), 'utf8')).toBe('old\n');
    });

    it('does not swallow mid-read abort or schedule the next file', async () => {
        const controller = new AbortController();
        const reason = new Error('read stopped');
        const reads: string[] = [];

        hooks.beforeRead = (path) => {
            reads.push(path);
            if (path.endsWith('/README.md')) {
                controller.abort(reason);
            }
        };

        await expect(withCommandExecution(context(controller), (execution: CommandExecution) => readTool(projects.config, {
            project: 'demo',
            paths: [
                'README.md',
                'second.md',
            ],
        }, execution))).rejects.toBe(reason);
        expect(reads).toEqual([projects.path('demo', 'README.md')]);
    });

    it.each([
        'create',
        'write',
        'patch',
    ])('abort after temporary %s preserves original and cleans the temporary file', async (tool) => {
        const controller = new AbortController();
        const reason = new Error('write stopped');

        hooks.afterWrite = () => {
            controller.abort(reason);

            return Promise.resolve();
        };

        const ctx = context(controller);
        const run = tool === 'patch'
            ? (execution: CommandExecution) => patchTool(projects.config, {
                project: 'demo',
                path: 'README.md',
                expectedHash: hashContent('old\n'),
                operations: [
                    {
                        find: 'old',
                        replace: 'new',
                    },
                ],
            }, execution)
            : (execution: CommandExecution) => writeTool(projects.config, {
                project: 'demo',
                path: tool === 'create' ? 'new.md' : 'README.md',
                content: 'new',
                ...tool === 'create' ? {} : { expectedHash: hashContent('old\n') },
            }, execution);

        await expect(withCommandExecution(ctx, run)).rejects.toBe(reason);
        expect(ctx.changedPaths.size).toBe(0);
        expect(await readFile(projects.path('demo', 'README.md'), 'utf8')).toBe('old\n');
        expect((await readdir(projects.path('demo'))).filter((path) => path.endsWith('.tmp') || path === 'new.md')).toEqual([]);
    });

    it('publication winning the abort race remains atomic and reports changedPaths', async () => {
        const controller = new AbortController();
        const reason = new Error('cancel after publication');

        hooks.afterRename = () => controller.abort(reason);
        const ctx = context(controller);

        await expect(withCommandExecution(ctx, (execution: CommandExecution) => writeTool(projects.config, {
            project: 'demo',
            path: 'README.md',
            content: 'new\n',
            expectedHash: hashContent('old\n'),
        }, execution))).rejects.toBe(reason);
        expect(ctx.changedPaths).toEqual(new Set(['README.md']));
        expect(await readFile(projects.path('demo', 'README.md'), 'utf8')).toBe('new\n');
        expect((await readdir(projects.path('demo'))).filter((path) => path.endsWith('.tmp'))).toEqual([]);
    });

    it('rejects competing parallel hash mutations while releasing the reservation after abort', async () => {
        const controller = new AbortController();
        let release: () => void = () => undefined;
        let entered: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });

        hooks.afterWrite = async () => {
            entered();
            await gate;
        };

        const first = withCommandExecution(context(controller), (execution: CommandExecution) => writeTool(projects.config, {
            project: 'demo',
            path: 'README.md',
            expectedHash: hashContent('old\n'),
            content: 'first',
        }, execution)).catch((error: unknown) => error);

        await started;
        await expect(withCommandExecution(context(), (execution: CommandExecution) => patchTool(projects.config, {
            project: 'demo',
            path: 'README.md',
            expectedHash: hashContent('old\n'),
            operations: [
                {
                    find: 'old',
                    replace: 'second',
                },
            ],
        }, execution))).rejects.toMatchObject({ code: 'conflict' });
        controller.abort(new Error('stop'));
        release();
        await first;
        hooks.afterWrite = () => Promise.resolve();
        expect(await writeTool(projects.config, {
            project: 'demo',
            path: 'README.md',
            expectedHash: hashContent('old\n'),
            content: 'last',
        }))
            .toMatchObject({ changed: true });
    });

    it('cancels a real multi-file read during cooperative line traversal', async () => {
        await writeFile(projects.path('demo', 'README.md'), 'line\n'.repeat(100000));
        const controller = new AbortController();
        const reason = new Error('read traversal cancelled');
        const reads: string[] = [];

        hooks.beforeRead = (path) => {
            reads.push(path);
        };

        hooks.afterRead = (path) => {
            if (path.endsWith('/README.md')) {
                // Abort at the first cooperative traversal checkpoint after native I/O.
                setImmediate(() => controller.abort(reason));
            }
        };

        await expect(withCommandExecution(context(controller), (execution: CommandExecution) => readTool(projects.config, {
            project: 'demo',
            paths: [
                'README.md',
                'second.md',
            ],
        }, execution))).rejects.toBe(reason);
        expect(reads).toEqual([projects.path('demo', 'README.md')]);
    });
});
