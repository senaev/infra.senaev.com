import {
    readFile, readdir, writeFile,
} from 'node:fs/promises';

import { operationContext, withOperationContext } from 'senaev-utils/src/operations/operationContext';
import { hashContent } from 'senaev-utils/src/toolServer/contentHash';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createFileDiffAsync } from 'senaev-utils/src/toolServer/createFileDiffAsync';

import { cloneTool } from './cloneTool';
import { createTestProjects, type TestProjects } from './createTestProjects';
import { patchTool } from './patchTool';
import { readTool } from './readTool';
import { replaceText } from './replaceText';
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
            () => readTool(projects.config, {
                project: 'demo',
                paths: ['README.md'],
            }),
            () => writeTool(projects.config, {
                project: 'demo',
                path: 'README.md',
                content: 'new',
            }),
            () => patchTool(projects.config, {
                project: 'demo',
                path: 'README.md',
                expectedHash: hashContent('old\n'),
                operations: [
                    {
                        find: 'old',
                        replace: 'new',
                    },
                ],
            }),
            () => cloneTool(projects.config, {
                url: projects.path('demo'),
                name: 'copy',
            }),
        ];

        for (const run of calls) {
            await expect(withOperationContext<unknown>(context(controller), run)).rejects.toBe(reason);
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

        await expect(withOperationContext(context(controller), () => readTool(projects.config, {
            project: 'demo',
            paths: [
                'README.md',
                'second.md',
            ],
        }))).rejects.toBe(reason);
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
            ? () => patchTool(projects.config, {
                project: 'demo',
                path: 'README.md',
                expectedHash: hashContent('old\n'),
                operations: [
                    {
                        find: 'old',
                        replace: 'new',
                    },
                ],
            })
            : () => writeTool(projects.config, {
                project: 'demo',
                path: tool === 'create' ? 'new.md' : 'README.md',
                content: 'new',
                ...tool === 'create' ? {} : { expectedHash: hashContent('old\n') },
            });

        await expect(withOperationContext(ctx, run)).rejects.toBe(reason);
        expect(ctx.changedPaths.size).toBe(0);
        expect(await readFile(projects.path('demo', 'README.md'), 'utf8')).toBe('old\n');
        expect((await readdir(projects.path('demo'))).filter((path) => path.endsWith('.tmp') || path === 'new.md')).toEqual([]);
    });

    it('publication winning the abort race remains atomic and reports changedPaths', async () => {
        const controller = new AbortController();
        const reason = new Error('cancel after publication');

        hooks.afterRename = () => controller.abort(reason);
        const ctx = context(controller);

        await expect(withOperationContext(ctx, () => writeTool(projects.config, {
            project: 'demo',
            path: 'README.md',
            content: 'new\n',
            expectedHash: hashContent('old\n'),
        }))).rejects.toBe(reason);
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

        const first = withOperationContext(context(controller), () => writeTool(projects.config, {
            project: 'demo',
            path: 'README.md',
            expectedHash: hashContent('old\n'),
            content: 'first',
        })).catch((error: unknown) => error);

        await started;
        await expect(withOperationContext(context(), () => patchTool(projects.config, {
            project: 'demo',
            path: 'README.md',
            expectedHash: hashContent('old\n'),
            operations: [
                {
                    find: 'old',
                    replace: 'second',
                },
            ],
        }))).rejects.toMatchObject({ code: 'conflict' });
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

        await expect(withOperationContext(context(controller), () => readTool(projects.config, {
            project: 'demo',
            paths: [
                'README.md',
                'second.md',
            ],
        }))).rejects.toBe(reason);
        expect(reads).toEqual([projects.path('demo', 'README.md')]);
    });

    it('yields during patch scanning and terminates CPU diff workers on cancellation', async () => {
        for (const run of [
            () => replaceText('x\n'.repeat(100000), 'x', 'y'),
            () => createFileDiffAsync('large.md', 'a\nb\n'.repeat(20000), 'b\na\n'.repeat(20000)),
        ]) {
            const controller = new AbortController();
            const reason = new Error('CPU cancelled');
            const promise = withOperationContext<unknown>(context(controller), run);

            setImmediate(() => controller.abort(reason));
            await expect(promise).rejects.toBe(reason);
        }

        expect(operationContext()).toBeUndefined();
    });
});
