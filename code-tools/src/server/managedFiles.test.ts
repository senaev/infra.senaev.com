import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { operationContext } from 'senaev-utils/src/operations/operationContext';
import { hashContent } from 'senaev-utils/src/toolServer/contentHash';
import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { CODE_TOOLS } from '../tools/codeTools';
import { createTestProjects, type TestProjects } from '../tools/createTestProjects';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

type Reply = {
    status: string; code?: string;
    operation: { id: string; state: string; startedAt: number | null; changedPaths: string[]; timeoutSeconds: number };
    files?: { content: string; hash: string }[];
    hash?: string; result?: Record<string, unknown>; logs?: { text: string }[];
};

describe('all managed file tools', () => {
    let projects: TestProjects;
    let server: CodeToolsServer;

    beforeEach(async () => {
        projects = await createTestProjects({ demo: { 'README.md': 'hello\nsecond\n' } });
        server = createCodeToolsServer('files-test', projects.config);
    });
    afterEach(async () => {
        await server.close();
        await projects.remove();
        vi.restoreAllMocks();
    });
    function call(tool: string, payload: Record<string, unknown> = {}) {
        return server.inject({
            method: 'POST',
            url: `/code/${tool}`,
            headers: { authorization: createBearerAuthorizationHeader('files-test') },
            payload,
        });
    }

    function args(tool: string, suffix: string): Record<string, unknown> {
        if (tool === 'clone') {
            return {
                url: projects.path('demo'),
                name: `copy-${suffix}`,
            };
        }

        if (tool === 'write') {
            return {
                project: 'demo',
                path: `${suffix}.md`,
                content: 'written\n',
            };
        }

        if (tool === 'patch') {
            return {
                project: 'demo',
                path: 'README.md',
                expectedHash: hashContent('hello\nsecond\n'),
                operations: [
                    {
                        find: 'hello',
                        replace: 'patched',
                    },
                ],
            };
        }

        return {
            project: 'demo',
            paths: ['README.md'],
            startLine: 2,
            lineCount: 1,
        };
    }

    it.each([
        'queued',
        'parallel',
    ])('retains results and deduplicates every new tool with %s', async (executionPolicy) => {
        for (const tool of [
            'read',
            'write',
            'patch',
            'clone',
        ]) {
            const payload = {
                ...args(tool, executionPolicy),
                executionPolicy,
                requestId: tool,
                timeoutSeconds: 10800,
            };
            const first = (await call(tool, payload)).json<Reply>();

            expect(first.operation).toMatchObject({
                state: 'completed',
                timeoutSeconds: 10800,
            });
            expect((await call(tool, payload)).json()).toEqual(first);
            const retained = (await call('operation_result', { id: first.operation.id })).json<Reply>();
            const {
                status: _status, operation: _operation, ...domain
            } = first;

            expect(retained.result).toEqual(domain);
            expect((await call(tool, {
                ...payload,
                executionPolicy: executionPolicy === 'queued' ? 'parallel' : 'queued',
            })).json())
                .toMatchObject({ code: 'conflict' });
            if (tool === 'read') {
                expect(first.files).toEqual([
                    expect.objectContaining({
                        content: 'second\n',
                        hash: hashContent('hello\nsecond\n'),
                    }),
                ]);
            } else {
                const changed = {
                    clone: `copy-${executionPolicy}`,
                    write: `${executionPolicy}.md`,
                    patch: 'README.md',
                };

                expect(first.operation.changedPaths).toContain(changed[tool as keyof typeof changed]);
            }
        }
    });

    it('queues all four tools, cancels without executing and runs parallel work while FIFO is blocked', async () => {
        let entered: () => void = () => undefined;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });

        vi.spyOn(CODE_TOOLS, 'projects').mockImplementation(() => new Promise((resolve) => {
            operationContext()?.signal.addEventListener('abort', () => resolve({ projects: [] }), { once: true });
            entered();
        }));
        const active = call('projects');

        await started;
        const waiting: string[] = [];

        for (const tool of [
            'read',
            'write',
            'patch',
            'clone',
        ]) {
            const spy = vi.spyOn(CODE_TOOLS, tool as keyof typeof CODE_TOOLS);
            const queued = (await call(tool, {
                ...args(tool, 'waiting'),
                requestId: `queued-${tool}`,
                timeoutSeconds: 1,
            })).json<Reply>();

            expect(queued.operation).toMatchObject({
                state: 'queued',
                startedAt: null,
            });
            waiting.push(queued.operation.id);
            expect(spy).not.toHaveBeenCalled();
            const parallel = (await call(tool, {
                ...args(tool, 'parallel'),
                executionPolicy: 'parallel',
            })).json<Reply>();

            expect(parallel.operation.state).toBe('completed');
        }

        await delay(1100);
        for (const id of waiting) {
            expect((await call('operation_status', { id })).json<Reply>().operation.state).toBe('queued');
            expect((await call('operation_cancel', { id })).json<Reply>().operation)
                .toMatchObject({
                    state: 'cancelled',
                    startedAt: null,
                });
        }

        const block = (await active).json<Reply>();

        expect(block.operation.state).toBe('running');
        await call('operation_cancel', { id: block.operation.id });
        await vi.waitFor(async () => expect((await call('operation_status', { id: block.operation.id })).json<Reply>().operation.state).toBe('cancelled'));
    }, 12000);

    it.each([
        'read',
        'write',
        'patch',
    ])('returns a long %s handle and retains terminal cancellation', async (tool) => {
        vi.spyOn(CODE_TOOLS, tool as keyof typeof CODE_TOOLS).mockImplementation(() => new Promise<never>((_resolve, reject) => {
            const context = operationContext();

            context?.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
        }));
        const body = (await call(tool, {
            ...args(tool, 'slow'),
            executionPolicy: 'parallel',
            requestId: tool,
        })).json<Reply>();

        expect(body.operation.state).toBe('running');
        expect((await call('operation_result', { id: body.operation.id })).json<Reply>().operation.state).toBe('running');
        await call('operation_cancel', { id: body.operation.id });
        await vi.waitFor(async () => {
            expect((await call('operation_result', { id: body.operation.id })).json<Reply>())
                .toMatchObject({
                    operation: { state: 'cancelled' },
                    result: { code: 'cancelled' },
                });
        });
    }, 10000);

    it.each([
        'queued',
        'parallel',
    ])('times out every file handler without polls under %s', async (executionPolicy) => {
        for (const tool of [
            'read',
            'write',
            'patch',
        ]) {
            vi.spyOn(CODE_TOOLS, tool as keyof typeof CODE_TOOLS).mockImplementation(() => new Promise<never>((_resolve, reject) => {
                const context = operationContext();

                context?.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
            }));
            expect((await call(tool, {
                ...args(tool, 'deadline'),
                executionPolicy,
                timeoutSeconds: 1,
            })).json<Reply>())
                .toMatchObject({
                    code: 'timed_out',
                    operation: { state: 'timed_out' },
                });
        }
    }, 10000);

    it('retains stale-hash conflicts and failed patches without publishing a partial file', async () => {
        for (const tool of [
            'write',
            'patch',
        ]) {
            const payload = tool === 'write'
                ? {
                    project: 'demo',
                    path: 'README.md',
                    content: 'new',
                    expectedHash: '0'.repeat(64),
                }
                : {
                    ...args('patch', 'conflict'),
                    operations: [
                        {
                            find: 'hello',
                            replace: 'new',
                        },
                        {
                            find: 'absent',
                            replace: '',
                        },
                    ],
                };
            const body = (await call(tool, payload)).json<Reply>();

            expect(body.operation.state).toBe('failed');
            expect(body.operation.changedPaths).toEqual([]);
            expect((await call('operation_result', { id: body.operation.id })).json<Reply>().result)
                .toMatchObject({ code: tool === 'write' ? 'conflict' : 'not_found' });
        }

        expect(await readFile(projects.path('demo', 'README.md'), 'utf8')).toBe('hello\nsecond\n');
    });
});
