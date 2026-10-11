import {
    mkdtemp, readdir, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { OperationManager, executionTimeout } from './OperationManager';
import {
    operationCheckpoint, operationContext, scheduleDeadline, withOperationContext,
} from './operationContext';

const directories: string[] = [];

afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(directories.splice(0).map((path) => rm(path, {
        recursive: true,
        force: true,
    })));
});

async function createManager(backend = 'code') {
    const directory = await mkdtemp(join(tmpdir(), 'operations-'));

    directories.push(directory);

    return {
        directory,
        manager: new OperationManager(directory, backend),
    };
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
        const { manager } = await createManager();
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
        const { manager, directory } = await createManager();
        const gate = deferred<Record<string, unknown>>();
        const running = manager.launch({
            tool: 'run',
            args: {
                requestId: 'active',
                timeoutSeconds: 10800,
            },
            run: () => gate.promise,
        });

        await waitFor(async () => (await manager.control('operations', {})).operations instanceof Array && (await readdir(directory)).length === 1);
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
        expect((await readdir(directory)).filter((name) => name.endsWith('.json'))).toHaveLength(6);
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
        const { manager } = await createManager();
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

    it('preserves results and bounded replayable stream cursors across restart', async () => {
        const { manager, directory } = await createManager();
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
        await manager.close();
        const recovered = new OperationManager(directory, 'code');

        expect(await recovered.control('operation_result', { id })).toMatchObject({
            operation: { state: 'completed' },
            result: { value: 42 },
        });
        await expect(recovered.control('operation_status', {
            id,
            cursor: 100000,
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await recovered.close();
    });

    it('recovers queued/running records as interrupted without replay and isolates backends', async () => {
        const { manager, directory } = await createManager();
        const reply = await manager.launch({
            tool: 'read',
            args: {},
            run: () => Promise.resolve({}),
        });

        await manager.close();
        const { id } = reply.operation as { id: string };
        const path = join(directory, `${id}.json`);
        const record = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

        record.state = 'queued';
        await writeFile(path, JSON.stringify(record));
        const recovered = new OperationManager(directory, 'code');

        expect(await recovered.control('operation_result', { id })).toMatchObject({
            operation: { state: 'interrupted' },
            result: { code: 'interrupted' },
        });
        const vault = new OperationManager(directory, 'obsidian');

        await expect(vault.control('operation_status', { id })).rejects.toMatchObject({ code: 'not_found' });
        await recovered.close();
        await vault.close();
    });

    it('does not count queued time and enforces timeout without polling', async () => {
        const { manager } = await createManager();
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
        const { manager: deadlineManager } = await createManager();
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

    it('pages large final JSON results without rerunning the handler', async () => {
        const { manager } = await createManager();
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
