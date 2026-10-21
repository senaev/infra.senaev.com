import { setTimeout as pause } from 'node:timers/promises';

import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { createCommandExecution, type CommandExecution } from '../commands/CommandExecution';
import { scheduleDeadline } from '../utils/process/scheduleDeadline';

import { OperationManager, executionTimeout } from './OperationManager';

afterEach(() => {
    vi.useRealTimers();
});

function createManager(backend = 'code') {
    return { manager: new OperationManager(backend) };
}

function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });

    return {
        promise,
        resolve,
    };
}

async function waitFor(check: () => Promise<boolean>) {
    const deadline = performance.now() + 3000;

    while (performance.now() < deadline) {
        if (await check()) {
            return;
        }

        await pause(10);
    }

    throw new Error('Expected operation transition');
}

describe('OperationManager', () => {
    it('enforces the observation boundary without charging queued work', async () => {
        vi.useFakeTimers();
        const manager = new OperationManager('code');
        const gate = deferred<Record<string, unknown>>();
        let observed = false;
        const launch = manager.launch({
            tool: 'read',
            args: {},
            run: () => gate.promise,
        });

        void launch.then(() => {
            observed = true;
        });
        await vi.advanceTimersByTimeAsync(0);
        const queued = await manager.launch({
            tool: 'list',
            args: {},
            run: () => Promise.resolve({}),
        });

        expect(queued.operation).toMatchObject({
            state: 'queued',
            startedAt: null,
        });
        await vi.advanceTimersByTimeAsync(4999);
        expect(observed).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(observed).toBe(true);
        expect((await launch).operation).toMatchObject({ state: 'running' });
        gate.resolve({});
        await manager.close();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('expires retries and control reads without unrelated admissions', async () => {
        const manager = new OperationManager('code');
        const run = vi.fn(() => Promise.resolve({ value: 42 }));
        const options = {
            tool: 'read',
            args: { requestId: 'expired' },
            run,
        };
        const first = await manager.launch(options);
        const now = Date.now();

        vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
        try {
            const retry = await manager.launch(options);

            expect(retry.operation).not.toMatchObject({ id: (first.operation as { id: string }).id });
            expect(run).toHaveBeenCalledTimes(2);
            vi.mocked(Date.now).mockReturnValue(now + 16 * 24 * 60 * 60 * 1000);
            await expect(manager.control('operation_result', { id: (retry.operation as { id: string }).id }))
                .rejects.toMatchObject({ code: 'not_found' });
            expect((await manager.control('operations', {})).operations).toEqual([]);
        } finally {
            vi.restoreAllMocks();
            await manager.close();
        }
    });

    it('keeps active work discoverable after terminal history fills', async () => {
        const manager = new OperationManager('code');
        const gate = deferred<Record<string, unknown>>();
        const launch = manager.launch({
            tool: 'run',
            args: {},
            run: () => gate.promise,
        });

        await waitFor(async () => ((await manager.control('operations', {})).operations as unknown[]).length === 1);
        const first = ((await manager.control('operations', {})).operations as { id: string }[])[0];

        for (let index = 0; index < 101; index++) {
            await manager.launch({
                tool: 'read',
                args: { executionPolicy: 'parallel' },
                run: () => Promise.resolve({}),
            });
        }

        const recent = (await manager.control('operations', {})).operations as { id: string; state: string }[];

        expect(recent).toHaveLength(101);
        expect(recent).toContainEqual(expect.objectContaining({
            id: first?.id,
            state: 'running',
        }));
        gate.resolve({});
        await launch;
        await manager.close();
    });

    it('validates record-specific cursors before cancelling', async () => {
        const manager = new OperationManager('code');
        const gate = deferred<Record<string, unknown>>();
        let signal: AbortSignal | undefined;
        const launch = manager.launch({
            tool: 'run',
            args: {},
            run: (execution) => {
                signal = execution?.signal;

                return gate.promise;
            },
        });

        await waitFor(() => Promise.resolve(signal !== undefined));
        const first = ((await manager.control('operations', {})).operations as { id: string }[])[0];

        await expect(manager.control('operation_cancel', {
            id: first?.id,
            cursor: 1,
        }))
            .rejects.toMatchObject({ code: 'invalid_arguments' });
        expect(signal?.aborted).toBe(false);
        gate.resolve({});
        await launch;
        await manager.close();
    });

    it('reports unexpected failures without exposing arguments or losing cleanup', async () => {
        const error = new Error('diagnostic');
        const report = vi.fn(() => {
            throw new Error('reporter failed');
        });
        const manager = new OperationManager('code', report);
        const reply = await manager.launch({
            tool: 'read',
            args: { privateText: 'secret' },
            run: () => Promise.reject(error),
        });

        expect(reply).toMatchObject({
            code: 'internal_error',
            operation: { state: 'failed' },
        });
        expect(report).toHaveBeenCalledWith(error, {
            id: (reply.operation as { id: string }).id,
            backend: 'code',
            tool: 'read',
        });
        expect(await manager.launch({
            tool: 'read',
            args: {},
            run: () => Promise.resolve({ value: 1 }),
        }))
            .toMatchObject({
                value: 1,
                operation: { state: 'completed' },
            });
        await manager.close();
    });

    it('bypasses a full FIFO without a parallel cap and preserves retries and cleanup', async () => {
        const { manager } = createManager();
        const gates: { resolve: (value: Record<string, unknown>) => void }[] = [];
        const start = (args: Record<string, unknown>) => {
            const gate = deferred<Record<string, unknown>>();

            gates.push(gate);

            return manager.launch({
                tool: 'run',
                args,
                run: () => gate.promise,
            });
        };
        const fifo = start({ requestId: 'fifo' });

        await waitFor(async () => ((await manager.control('operations', {})).operations as unknown[]).length === 1);
        for (let index = 0; index < 5; index++) {
            await manager.launch({
                tool: 'list',
                args: {},
                run: () => Promise.resolve({}),
            });
        }

        const fast = await manager.launch({
            tool: 'search',
            args: {
                executionPolicy: 'parallel',
                requestId: 'fast',
            },
            run: () => Promise.resolve({ value: 42 }),
        });

        expect(fast).toMatchObject({
            value: 42,
            operation: {
                executionPolicy: 'parallel',
                state: 'completed',
            },
        });
        const launches = Array.from({ length: 4 }, (_, index) => start({
            executionPolicy: 'parallel',
            requestId: `parallel-${index}`,
        }));

        await waitFor(async () => ((await manager.control('operations', {})).operations as unknown[]).length === 11);
        const all = (await manager.control('operations', {})).operations as { id: string; executionPolicy: string; state: string }[];
        const parallel = all.filter((entry) => entry.executionPolicy === 'parallel' && entry.state === 'running');

        expect(parallel).toHaveLength(4);
        const run = vi.fn(() => Promise.resolve({}));

        expect(await manager.launch({
            tool: 'run',
            args: { executionPolicy: 'parallel' },
            run,
        }))
            .toMatchObject({ operation: { state: 'completed' } });
        const retry = await manager.launch({
            tool: 'run',
            args: {
                executionPolicy: 'parallel',
                requestId: 'parallel-0',
            },
            run,
        });

        expect(retry.operation).toMatchObject({ id: parallel[3]?.id });
        await expect(manager.launch({
            tool: 'run',
            args: {
                executionPolicy: 'queued',
                requestId: 'parallel-0',
            },
            run,
        })).rejects.toMatchObject({ code: 'conflict' });
        const cancelledId = parallel[0]?.id;

        await manager.control('operation_cancel', { id: cancelledId });
        expect(await manager.launch({
            tool: 'run',
            args: { executionPolicy: 'parallel' },
            run,
        }))
            .toMatchObject({ operation: { state: 'completed' } });
        expect(run).toHaveBeenCalledTimes(2);
        for (const gate of gates.slice(1)) {
            gate.resolve({});
        }

        await Promise.all(launches);
        await waitFor(async () => {
            const result = await manager.control('operation_status', { id: cancelledId });

            return (result.operation as { state: string }).state === 'cancelled';
        });
        expect(await manager.launch({
            tool: 'list',
            args: { executionPolicy: 'parallel' },
            run,
        }))
            .toMatchObject({ operation: { state: 'completed' } });
        expect((await manager.control('operations', {})).operations)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({
                    executionPolicy: 'queued',
                    state: 'running',
                }),
            ]));
        gates[0]?.resolve({});
        await fifo;
        await manager.close();
    });

    it('validates policy, times out parallel work and interrupts every policy on close', async () => {
        vi.useFakeTimers();
        const { manager } = createManager();
        const run = vi.fn(() => Promise.resolve({}));

        for (const executionPolicy of [
            'sync',
            null,
            1,
        ]) {
            await expect(manager.launch({
                tool: 'read',
                args: { executionPolicy },
                run,
            }))
                .rejects.toMatchObject({ code: 'invalid_arguments' });
        }

        expect(run).not.toHaveBeenCalled();
        const abortable = (execution: CommandExecution) => new Promise<Record<string, unknown>>((resolve) => {
            execution?.signal.addEventListener('abort', () => resolve({}), { once: true });
        });
        const timingOut = manager.launch({
            tool: 'run',
            args: {
                executionPolicy: 'parallel',
                timeoutSeconds: 1,
            },
            run: abortable,
        });

        await vi.advanceTimersByTimeAsync(1000);
        const timeout = await timingOut;

        expect(timeout.operation).toMatchObject({
            state: 'timed_out',
            executionPolicy: 'parallel',
        });
        const launches = [
            manager.launch({
                tool: 'run',
                args: {},
                run: abortable,
            }),
            manager.launch({
                tool: 'run',
                args: { executionPolicy: 'parallel' },
                run: abortable,
            }),
            manager.launch({
                tool: 'run',
                args: { executionPolicy: 'parallel' },
                run: abortable,
            }),
        ];

        await waitFor(async () => ((await manager.control('operations', {})).operations as { state: string }[])
            .filter((entry) => entry.state === 'running').length === 3);
        await manager.close();
        for (const reply of await Promise.all(launches)) {
            expect(reply.operation).toMatchObject({ state: 'interrupted' });
        }

        expect((await manager.control('operations', {})).operations).toEqual([]);
    });

    it('returns fast structured results, records failures and deduplicates retries', async () => {
        const { manager } = createManager();
        const run = vi.fn(() => Promise.resolve({ value: 42 }));
        const reply = await manager.launch({
            tool: 'read',
            args: {
                requestId: 'same',
                paths: ['a'],
            },
            run,
        });

        expect(reply.value).toBe(42);
        const duplicate = await manager.launch({
            tool: 'read',
            args: {
                paths: ['a'],
                requestId: 'same',
            },
            run,
        });

        expect(duplicate).toEqual(reply);
        expect(run).toHaveBeenCalledTimes(1);
        await expect(manager.launch({
            tool: 'read',
            args: {
                requestId: 'same',
                paths: ['b'],
            },
            run,
        })).rejects.toMatchObject({ code: 'conflict' });
        const failed = await manager.launch({
            tool: 'run',
            args: {},
            run: () => Promise.resolve({
                exitCode: 7,
                stderr: 'failure',
            }),
        });

        expect(failed.operation).toMatchObject({ state: 'failed' });
        await manager.close();
    });

    it('observes for 5 seconds, admits five queued jobs immediately and cancels without executing', async () => {
        vi.useFakeTimers();
        const { manager } = createManager();
        const gate = deferred<Record<string, unknown>>();
        const running = manager.launch({
            tool: 'run',
            args: {
                requestId: 'active',
                timeoutSeconds: 10800,
            },
            run: () => gate.promise,
        });

        await waitFor(async () => ((await manager.control('operations', {})).operations as unknown[]).length === 1);
        const queuedRun = vi.fn(() => Promise.resolve({}));
        const queued = [];

        for (let index = 0; index < 5; index++) {
            const reply = await manager.launch({
                tool: 'read',
                args: { requestId: `q${index}` },
                run: queuedRun,
            });

            expect(reply.operation).toMatchObject({
                state: 'queued',
                startedAt: null,
            });
            queued.push(reply);
        }

        await expect(manager.launch({
            tool: 'read',
            args: {},
            run: queuedRun,
        })).rejects.toMatchObject({ code: 'QUEUE_FULL' });
        expect((await manager.control('operations', {})).operations).toHaveLength(6);
        expect(await manager.launch({
            tool: 'read',
            args: { requestId: 'q0' },
            run: queuedRun,
        })).toEqual(queued[0]);
        await vi.advanceTimersByTimeAsync(5000);
        const observed = await running;

        expect(observed.operation).toMatchObject({
            state: 'running',
            timeoutSeconds: 10800,
        });
        for (const reply of queued) {
            const operation = reply.operation as { id: string };

            expect(await manager.control('operation_cancel', { id: operation.id })).toMatchObject({ operation: { state: 'cancelled' } });
        }

        gate.resolve({ value: 'finished' });
        await manager.close();
        expect(queuedRun).not.toHaveBeenCalled();
    }, 10000);

    it('executes FIFO across tool types and holds the slot while abort cleanup is pending', async () => {
        const { manager } = createManager();
        const started = deferred<void>();
        const cleanup = deferred<Record<string, unknown>>();
        const order: string[] = [];
        const active = manager.launch({
            tool: 'run',
            args: {},
            run: () => {
                order.push('run');
                started.resolve();

                return cleanup.promise;
            },
        });

        await started.promise;
        const first = await manager.launch({
            tool: 'write',
            args: {},
            run: () => {
                order.push('write');

                return Promise.resolve({});
            },
        });
        const second = await manager.launch({
            tool: 'search',
            args: {},
            run: () => {
                order.push('search');

                return Promise.resolve({});
            },
        });
        const recent = await manager.control('operations', {});
        const entries = recent.operations as { id: string; tool: string }[];
        const id = entries.find((entry) => entry.tool === 'run')?.id;

        await manager.control('operation_cancel', { id });
        expect(order).toEqual(['run']);
        cleanup.resolve({});
        await active;
        await waitFor(async () => {
            const entry = second.operation as { id: string };
            const result = await manager.control('operation_status', { id: entry.id });

            return (result.operation as { state: string }).state === 'completed';
        });
        expect(order).toEqual([
            'run',
            'write',
            'search',
        ]);
        expect(first.operation).toMatchObject({ state: 'queued' });
        await manager.close();
    });

    it('retains results and bounded replayable stream cursors in memory', async () => {
        const { manager } = createManager();
        const reply = await manager.launch({
            tool: 'run',
            args: {},
            run: (execution) => {
                const context = execution;

                context?.log('stdout', 'a'.repeat(200000));
                context?.log('stderr', 'error');

                return Promise.resolve({ value: 42 });
            },
        });
        const { id } = reply.operation as { id: string };
        const page = await manager.control('operation_status', {
            id,
            cursor: 0,
        });

        expect(page.logsTruncated).toBe(true);
        expect(await manager.control('operation_status', {
            id,
            cursor: 0,
        })).toEqual(page);
        expect(await manager.control('operation_result', { id })).toMatchObject({
            operation: { state: 'completed' },
            result: { value: 42 },
        });
        await expect(manager.control('operation_status', {
            id,
            cursor: 1000000,
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await manager.close();
    });

    it('forgets IDs and request deduplication in a new instance and isolates backends', async () => {
        const { manager } = createManager();
        const run = vi.fn(() => Promise.resolve({}));
        const options = {
            tool: 'read',
            args: { requestId: 'retry' },
            run,
        };
        const reply = await manager.launch(options);
        const { id } = reply.operation as { id: string };
        const fresh = new OperationManager('code');
        const vault = new OperationManager('obsidian');

        await expect(fresh.control('operation_status', { id })).rejects.toMatchObject({ code: 'not_found' });
        await expect(vault.control('operation_status', { id })).rejects.toMatchObject({ code: 'not_found' });
        const repeated = await fresh.launch(options);

        expect(repeated.operation).not.toMatchObject({ id });
        expect(run).toHaveBeenCalledTimes(2);
        await manager.close();
        expect((await manager.control('operations', {})).operations).toEqual([]);
        await expect(manager.launch(options)).rejects.toMatchObject({ code: 'conflict' });
        await fresh.close();
        await vault.close();
    });

    it('cancels queued work and releases retained records when closed', async () => {
        const { manager } = createManager();
        const started = deferred<void>();
        const active = manager.launch({
            tool: 'run',
            args: {},
            run: (execution) => new Promise((resolve) => {
                execution?.signal.addEventListener('abort', () => resolve({}), { once: true });
                started.resolve();
            }),
        });

        await started.promise;
        const queuedRun = vi.fn(() => Promise.resolve({}));

        await manager.launch({
            tool: 'read',
            args: {},
            run: queuedRun,
        });
        await manager.close();
        expect((await active).operation).toMatchObject({ state: 'interrupted' });
        expect(queuedRun).not.toHaveBeenCalled();
        expect((await manager.control('operations', {})).operations).toEqual([]);
    });

    it('does not count queued time and enforces timeout without polling', async () => {
        vi.useFakeTimers();
        const { manager } = createManager();
        const started = deferred<void>();
        const first = manager.launch({
            tool: 'run',
            args: {},
            run: async () => {
                started.resolve();
                await new Promise<void>((resolve) => setTimeout(resolve, 1100));

                return {};
            },
        });

        await started.promise;
        const second = await manager.launch({
            tool: 'read',
            args: { timeoutSeconds: 1 },
            run: () => Promise.resolve({ value: 'not timed out in queue' }),
        });
        const { id } = second.operation as { id: string };

        await vi.advanceTimersByTimeAsync(1100);
        await first;
        await waitFor(async () => {
            const result = await manager.control('operation_result', { id });

            return (result.operation as { state: string }).state === 'completed';
        });
        expect(await manager.control('operation_result', { id })).toMatchObject({ result: { value: 'not timed out in queue' } });
        await manager.close();
        const { manager: deadlineManager } = createManager();
        const pendingDeadline = deadlineManager.launch({
            tool: 'run',
            args: { timeoutSeconds: 1 },
            run: (execution) => new Promise((resolve) => {
                const signal = execution?.signal;

                signal?.addEventListener('abort', () => resolve({}), { once: true });
            }),
        });

        await vi.advanceTimersByTimeAsync(1000);
        const hung = await pendingDeadline;

        expect(hung.operation).toMatchObject({ state: 'timed_out' });
        await deadlineManager.close();
    });

    it('enforces the reduced result quota and retains a JSON snapshot', async () => {
        const { manager } = createManager();
        const result = { text: 'a'.repeat(999_989) };
        const reply = await manager.launch({
            tool: 'read',
            args: {},
            run: () => Promise.resolve(result),
        });
        const { id } = reply.operation as { id: string };

        expect(reply.operation).toMatchObject({ state: 'completed' });
        result.text = 'mutated after completion';
        const retained = await manager.control('operation_result', { id });

        expect(retained.totalChars).toBe(1_000_000);
        expect(String(retained.resultJson)).toContain('a'.repeat(100));
        const oversized = await manager.launch({
            tool: 'read',
            args: {},
            run: () => Promise.resolve({ text: 'b'.repeat(999_990) }),
        });

        expect(oversized).toMatchObject({
            code: 'command_failed',
            operation: { state: 'failed' },
        });
        await manager.close();
    });

    it('bounds terminal records and expires old results without storage', async () => {
        const { manager } = createManager();
        const options = {
            tool: 'read',
            args: {},
            run: () => Promise.resolve({}),
        };
        const oldest = await manager.launch(options);
        const { id } = oldest.operation as { id: string };

        for (let index = 0; index < 100; index++) {
            await manager.launch(options);
        }

        await expect(manager.control('operation_result', { id })).rejects.toMatchObject({ code: 'not_found' });
        expect((await manager.control('operations', {})).operations).toHaveLength(100);
        const now = Date.now();

        vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
        try {
            await manager.launch(options);
            expect((await manager.control('operations', {})).operations).toHaveLength(1);
        } finally {
            vi.restoreAllMocks();
            await manager.close();
        }
    });

    it('pages large final JSON results without rerunning the handler', async () => {
        const { manager } = createManager();
        const expected = { text: 'z'.repeat(90000) };
        const reply = await manager.launch({
            tool: 'read',
            args: {},
            run: () => Promise.resolve(expected),
        });
        const { id } = reply.operation as { id: string };
        let offset = 0;
        let text = '';

        for (;;) {
            const page = await manager.control('operation_result', {
                id,
                offset,
            });

            text += String(page.resultJson);
            if (page.nextOffset === null) {
                break;
            }

            offset = Number(page.nextOffset);
        }

        expect(JSON.parse(text)).toEqual(expected);
        await manager.close();
    });
});

describe('deadline and cooperative cancellation', () => {
    it('defaults to 60 and accepts arbitrarily long finite positive integer timeouts', () => {
        expect(executionTimeout(undefined)).toBe(60);
        expect(executionTimeout(10800)).toBe(10800);
        expect(executionTimeout(1e100)).toBe(1e100);
        for (const value of [
            0,
            -1,
            1.5,
            null,
            Infinity,
            '60',
        ]) {
            expect(() => executionTimeout(value)).toThrow();
        }
    });

    it('chunks large deadlines without timer overflow and disposes its timer', () => {
        vi.useFakeTimers();
        const abort = vi.fn();
        const stop = scheduleDeadline(1e100, abort);

        vi.advanceTimersByTime(2_147_483_647);
        expect(abort).not.toHaveBeenCalled();
        stop();
        expect(vi.getTimerCount()).toBe(0);
        const stopShort = scheduleDeadline(60, abort);

        vi.advanceTimersByTime(60000);
        expect(abort).toHaveBeenCalledOnce();
        stopShort();
    });
    it('rejects a pre-aborted explicit capability before traversal', async () => {
        const controller = new AbortController();

        controller.abort(new Error('cancelled'));
        await expect(createCommandExecution({ signal: controller.signal }).checkpoint()).rejects.toThrow('cancelled');
    });

    it('isolates signals, logs and changes of overlapping real managed callbacks', async () => {
        const manager = new OperationManager('isolation');
        const firstReady = deferred<void>();
        const secondReady = deferred<void>();
        const firstGate = deferred<void>();
        const secondGate = deferred<void>();
        let firstExecution: CommandExecution | undefined;
        let secondExecution: CommandExecution | undefined;
        const firstArgs = {
            executionPolicy: 'parallel',
            requestId: 'first',
        };
        const secondArgs = {
            executionPolicy: 'parallel',
            requestId: 'second',
        };
        const firstLaunch = manager.launch({
            tool: 'first',
            args: firstArgs,
            run: async (execution) => {
                firstExecution = execution;
                execution.log('stdout', 'first');
                firstReady.resolve();
                await firstGate.promise;
                execution.throwIfAborted();
                execution.changedPath('first.md');

                return {};
            },
        });
        const secondLaunch = manager.launch({
            tool: 'second',
            args: secondArgs,
            run: async (execution) => {
                secondExecution = execution;
                execution.log('stderr', 'second');
                secondReady.resolve();
                await secondGate.promise;
                execution.throwIfAborted();
                execution.changedPath('second.md');

                return { value: 'second' };
            },
        });

        try {
            await Promise.all([
                firstReady.promise,
                secondReady.promise,
            ]);
            const first = await manager.launch({
                tool: 'first',
                args: firstArgs,
                run: () => Promise.resolve({}),
            });
            const second = await manager.launch({
                tool: 'second',
                args: secondArgs,
                run: () => Promise.resolve({}),
            });

            expect(firstExecution).not.toBe(secondExecution);
            expect(firstExecution?.signal).not.toBe(secondExecution?.signal);
            await manager.control('operation_cancel', { id: first.operation.id });
            expect(firstExecution?.signal.aborted).toBe(true);
            expect(secondExecution?.signal.aborted).toBe(false);
            firstGate.resolve();
            secondGate.resolve();
            await Promise.all([
                firstLaunch,
                secondLaunch,
            ]);
            expect(await manager.control('operation_result', { id: first.operation.id })).toMatchObject({
                operation: {
                    state: 'cancelled',
                    changedPaths: [],
                },
                logs: [
                    {
                        stream: 'stdout',
                        text: 'first',
                    },
                ],
            });
            expect(await manager.control('operation_result', { id: second.operation.id })).toMatchObject({
                operation: {
                    state: 'completed',
                    changedPaths: ['second.md'],
                },
                logs: [
                    {
                        stream: 'stderr',
                        text: 'second',
                    },
                ],
                result: { value: 'second' },
            });
        } finally {
            firstGate.resolve();
            secondGate.resolve();
            await Promise.all([
                firstLaunch,
                secondLaunch,
            ]);
            await manager.close();
        }
    });
});
