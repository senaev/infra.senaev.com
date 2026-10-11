import {
    chmod, mkdir, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { withOperationContext } from 'senaev-utils/src/operations/operationContext';
import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { CODE_TOOLS } from '../tools/codeTools';
import { createTestProjects, type TestProjects } from '../tools/createTestProjects';
import { listTool } from '../tools/listTool';
import { parseRipgrepJson, searchTool } from '../tools/searchTool';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

const metadata = vi.hoisted(() => {
    return { beforeStat: (_path: unknown) => undefined as void };
});

vi.mock('node:fs/promises', async (importOriginal) => {
    const original = await importOriginal<typeof import('node:fs/promises')>();

    return {
        ...original,
        lstat: (...args: Parameters<typeof original.lstat>) => {
            metadata.beforeStat(args[0]);

            return original.lstat(...args);
        },
    };
});

const HEADERS = { authorization: createBearerAuthorizationHeader('read-only-test') };

type Reply = {
    status: string; code?: string; files?: unknown[]; entries?: unknown[];
    operation: { id: string; state: string; startedAt: number | null; timeoutSeconds: number };
    result?: { code?: string; files?: unknown[]; entries?: unknown[] };
    logs?: { text: string }[];
};

describe('managed search and list', () => {
    let projects: TestProjects;
    let server: CodeToolsServer;

    beforeEach(async () => {
        projects = await createTestProjects({
            demo: {
                'README.md': 'needle\n',
                'src/a.ts': 'needle\n',
            },
        });
        server = createCodeToolsServer('read-only-test', projects.config);
    });
    afterEach(async () => {
        await server.close();
        await projects.remove();
        vi.restoreAllMocks();
        metadata.beforeStat = () => undefined;
    });
    function call(tool: string, payload: Record<string, unknown> = {}) {
        return server.inject({
            method: 'POST',
            url: `/code/${tool}`,
            headers: HEADERS,
            payload,
        });
    }

    async function fakeExecutable(name: string, content: string) {
        const bin = projects.path('demo', '.test-bin');

        await mkdir(bin, { recursive: true });
        await writeFile(join(bin, name), content);
        await chmod(join(bin, name), 0o755);
        projects.config.commandEnv.PATH = `${bin}:${process.env.PATH ?? ''}`;
    }

    it('preserves real results, no matches and search errors with shared execution arguments', async () => {
        for (const tool of [
            'list',
            'search',
        ]) {
            const args = {
                project: 'demo',
                requestId: tool,
                timeoutSeconds: 10800,
                ...tool === 'search' ? { queries: ['needle'] } : { recursive: true },
            };
            const first = (await call(tool, args)).json<Reply>();
            const repeat = (await call(tool, args)).json<Reply>();

            expect(first.operation).toMatchObject({
                state: 'completed',
                timeoutSeconds: 10800,
            });
            expect(repeat.operation.id).toBe(first.operation.id);
            expect((await call('operation_result', { id: first.operation.id })).json<Reply>().result)
                .toMatchObject(tool === 'search' ? { files: first.files } : { entries: first.entries });
        }

        expect((await call('search', {
            project: 'demo',
            queries: ['missing'],
        })).json<Reply>())
            .toMatchObject({
                status: 'ok',
                matchedFiles: 0,
                operation: { state: 'completed' },
            });
        expect((await call('search', {
            project: 'demo',
            queries: ['('],
            regex: true,
        })).json<Reply>())
            .toMatchObject({
                status: 'error',
                code: 'invalid_arguments',
                operation: { state: 'failed' },
            });
        for (const tool of [
            'list',
            'search',
        ]) {
            expect((await call(tool, {
                project: 'demo',
                ...tool === 'search' ? { queries: ['needle'] } : {},
                timeoutSeconds: 0,
            })).statusCode).toBe(400);
        }
    });

    it('shares the queue, cancels waiting search without invoking it and excludes queue time', async () => {
        let release: () => void = () => undefined;
        let started: () => void = () => undefined;
        const entered = new Promise<void>((resolve) => {
            started = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        vi.spyOn(CODE_TOOLS, 'projects').mockImplementation(async () => {
            started();
            await gate;

            return { projects: [] };
        });
        const search = vi.spyOn(CODE_TOOLS, 'search');
        const active = call('projects');

        await entered;
        const queuedSearch = (await call('search', {
            project: 'demo',
            queries: ['needle'],
        })).json<Reply>();
        const queuedList = (await call('list', {
            project: 'demo',
            timeoutSeconds: 1,
        })).json<Reply>();

        expect(queuedList.operation.state).toBe('queued');
        expect((await call('operation_cancel', { id: queuedSearch.operation.id })).json<Reply>().operation)
            .toMatchObject({
                state: 'cancelled',
                startedAt: null,
            });
        expect((await call('read', {
            project: 'demo',
            paths: ['README.md'],
        })).statusCode).toBe(200);
        await delay(1100);
        release();
        await active;
        await vi.waitFor(async () => {
            expect((await call('operation_result', { id: queuedList.operation.id })).json<Reply>().operation.state)
                .toBe('completed');
        }, { timeout: 3000 });
        expect(search).not.toHaveBeenCalled();
    });

    it('aborts ripgrep on the common deadline and never returns a partial success', async () => {
        await fakeExecutable('rg', '#!/bin/bash\ntrap \'\' TERM\nprintf \'partial-json-output\\n\'\nsleep 30 &\nwait\n');
        const body = (await call('search', {
            project: 'demo',
            queries: ['needle'],
            timeoutSeconds: 1,
        })).json<Reply>();

        expect(body).toMatchObject({
            status: 'error',
            code: 'timed_out',
            operation: { state: 'timed_out' },
        });
        const retained = (await call('operation_result', { id: body.operation.id })).json<Reply>();

        expect(retained.result).toMatchObject({ code: 'timed_out' });
        expect(retained.result).not.toHaveProperty('files');
        expect(retained.logs).toContainEqual(expect.objectContaining({ text: 'partial-json-output\n' }));
    }, 8000);

    it('waits for sibling git cleanup before list releases its slot', async () => {
        await fakeExecutable('git', '#!/bin/bash\nif [[ "$*" == *--deleted* ]]; then exit 2; fi\ntrap \'\' TERM\nprintf \'list-started\\n\'\nsleep 30 &\nwait\n');
        const before = performance.now();
        const body = (await call('list', {
            project: 'demo',
            timeoutSeconds: 1,
        })).json<Reply>();

        expect(body.operation.state).toBe('timed_out');
        expect(performance.now() - before).toBeGreaterThanOrEqual(1900);
        expect((await call('read', {
            project: 'demo',
            paths: ['README.md'],
        })).statusCode).toBe(200);
    }, 8000);

    it('stops scheduling metadata reads and does not swallow their abort', async () => {
        const controller = new AbortController();
        const reason = new Error('metadata stopped');
        const readPaths: string[] = [];

        metadata.beforeStat = (path) => {
            const value = String(path);

            if (value === projects.path('demo', 'README.md')) {
                readPaths.push(value);
                controller.abort(reason);
                throw reason;
            }

            if (value === projects.path('demo', 'src/a.ts')) {
                readPaths.push(value);
            }
        };

        await expect(withOperationContext({
            signal: controller.signal,
            log: () => undefined,
            changedPaths: new Set<string>(),
        }, () => listTool(projects.config, {
            project: 'demo',
            recursive: true,
        }))).rejects.toBe(reason);
        expect(readPaths).toEqual([projects.path('demo', 'README.md')]);
    });

    it('checks already-aborted contexts and yields while parsing large result batches', async () => {
        const aborted = new AbortController();
        const reason = new Error('stop');

        aborted.abort(reason);
        const context = {
            signal: aborted.signal,
            log: () => undefined,
            changedPaths: new Set<string>(),
        };

        for (const tool of [
            listTool,
            searchTool,
        ]) {
            await expect(withOperationContext(context, () => tool(projects.config, {
                project: 'demo',
                queries: ['needle'],
            }))).rejects.toBe(reason);
        }

        const controller = new AbortController();
        const line = JSON.stringify({
            type: 'match',
            data: {
                path: { text: 'README.md' },
                lines: { text: 'needle\n' },
                line_number: 1,
                submatches: [],
            },
        });

        setImmediate(() => setImmediate(() => controller.abort(reason)));
        await expect(withOperationContext(
            {
                ...context,
                signal: controller.signal,
            },
            () => parseRipgrepJson(Array.from({ length: 2000 }, () => line).join('\n'))
        )).rejects.toBe(reason);
    });
});
