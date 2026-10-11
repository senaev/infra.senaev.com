import { setTimeout as pause } from 'node:timers/promises';

import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { OperationManager, executionTimeout } from './OperationManager';
import {
    operationCheckpoint, operationContext, scheduleDeadline, withOperationContext,
} from './operationContext';

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
            run: () => {
                const context = operationContext();

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
            cursor: 100000,
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
            run: () => new Promise((resolve) => {
                operationContext()?.signal.addEventListener('abort', () => resolve({}), { once: true });
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

        await first;
        await waitFor(async () => {
            const result = await manager.control('operation_result', { id });

            return (result.operation as { state: string }).state === 'completed';
        });
        expect(await manager.control('operation_result', { id })).toMatchObject({ result: { value: 'not timed out in queue' } });
        await manager.close();
        const { manager: deadlineManager } = createManager();
        const hung = await deadlineManager.launch({
            tool: 'run',
            args: { timeoutSeconds: 1 },
            run: () => new Promise((resolve) => {
                const signal = operationContext()?.signal;

                signal?.addEventListener('abort', () => resolve({}), { once: true });
            }),
        });

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

    it('throws an already aborted signal before traversing and isolates concurrent contexts', async () => {
        const controller = new AbortController();

        controller.abort(new Error('cancelled'));
        const context = {
            signal: controller.signal,
            log: () => undefined,
            changedPaths: new Set<string>(),
        };

        await expect(withOperationContext(context, operationCheckpoint)).rejects.toThrow('cancelled');
        expect(operationContext()).toBeUndefined();
    });
});
