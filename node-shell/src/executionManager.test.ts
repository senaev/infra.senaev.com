import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import type { NodeCommand } from './buildNodeCommand';
import {
    createExecutionManager, type ExecutionManager, markInterruptedExecutions, MAX_CONCURRENT_EXECUTIONS,
} from './executionManager';
import type { ExecutionRecord } from './executionRecord';
import type { ExecutionStore } from './executionStore';
import { createHostResolver } from './nodeHosts';
import type { CommandResult } from './runCommand';

const NOW = new Date('2026-11-22T10:00:00.000Z');

function createMemoryStore(): ExecutionStore & { records: Map<string, ExecutionRecord> } {
    const records = new Map<string, ExecutionRecord>();

    return {
        records,
        create: (record) => {
            if (records.has(record.executionId)) {
                return Promise.resolve(false);
            }

            records.set(record.executionId, record);

            return Promise.resolve(true);
        },
        read: (executionId) => Promise.resolve(records.get(executionId)),
        update: (record) => {
            records.set(record.executionId, record);

            return Promise.resolve();
        },
        list: () => Promise.resolve([...records.values()]),
        removeOlderThan: () => Promise.resolve(0),
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });

    return {
        promise,
        resolve,
        reject,
    };
}

const result: CommandResult = {
    exitCode: 0,
    signal: null,
    stdout: 'hetzner\n',
    stderr: '',
    outputTruncated: false,
    deadlineExceeded: false,
};

const request: NodeCommand = {
    executionId: 'e1',
    host: 'hetzner',
    command: 'hostname',
    timeoutSeconds: 30,
};

let store: ReturnType<typeof createMemoryStore>;
let run: ReturnType<typeof vi.fn<(options: { argv: readonly string[]; deadlineMs: number; maxOutputBytes: number }) => Promise<CommandResult>>>;
let manager: ExecutionManager;
const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
};

beforeEach(() => {
    store = createMemoryStore();
    run = vi.fn();
    manager = createExecutionManager({
        store,
        hosts: createHostResolver({
            localHost: 'hetzner',
            sshUser: 'root',
            listNodes: () => Promise.resolve([
                'hetzner',
                'senaev-madrid',
            ]),
        }),
        run,
        logger,
        now: () => NOW,
    });
});

describe('createExecutionManager', () => {
    it('saves the execution as running before the command, then saves the result', async () => {
        const pending = deferred<CommandResult>();

        run.mockImplementation(() => {
            expect(store.records.get('e1')?.status).toBe('running');

            return pending.promise;
        });

        const started = await manager.start(request);

        expect(started).toMatchObject({
            kind: 'started',
            record: { status: 'running' },
        });
        expect(run).toHaveBeenCalledOnce();
        expect(run.mock.lastCall?.[0].argv.slice(0, 8)).toEqual([
            'nsenter',
            '--target',
            '1',
            '--all',
            '--root',
            '--wd',
            '--',
            'systemd-run',
        ]);

        pending.resolve(result);
        await manager.idle();

        expect(store.records.get('e1')).toMatchObject({
            status: 'completed',
            exitCode: 0,
            stdout: 'hetzner\n',
            finishedAt: NOW.toISOString(),
        });
    });

    it('never runs the same execution ID twice, and refuses the ID with another request', async () => {
        run.mockResolvedValue(result);

        await manager.start(request);
        await manager.idle();

        await expect(manager.start(request)).resolves.toMatchObject({
            kind: 'existing',
            record: { status: 'completed' },
        });
        await expect(manager.start({
            ...request,
            command: 'reboot',
        })).resolves.toEqual({ kind: 'conflict' });
        expect(run).toHaveBeenCalledOnce();
    });

    it('refuses an unknown host without saving anything', async () => {
        await expect(manager.start({
            ...request,
            host: 'galkin',
        })).resolves.toEqual({ kind: 'unknown-host' });
        expect(store.records.size).toBe(0);
        expect(run).not.toHaveBeenCalled();
    });

    it('refuses a new command while the maximum number of commands runs', async () => {
        const pending = deferred<CommandResult>();

        run.mockReturnValue(pending.promise);

        for (let index = 0; index < MAX_CONCURRENT_EXECUTIONS; index += 1) {
            await manager.start({
                ...request,
                executionId: `e${index}`,
            });
        }

        await expect(manager.start({
            ...request,
            executionId: 'one-more',
        })).resolves.toEqual({ kind: 'busy' });
        expect(store.records.has('one-more')).toBe(false);

        pending.resolve(result);
        await manager.idle();
    });

    it('keeps the limit when many starts arrive at once and the store answers later', async () => {
        const pending = deferred<CommandResult>();
        const createNow = store.create;

        // A store that yields before it answers, like the file store.
        store.create = (record) => new Promise((resolve) => {
            setImmediate(() => resolve(createNow(record)));
        });
        run.mockReturnValue(pending.promise);

        const starts = Array.from({ length: MAX_CONCURRENT_EXECUTIONS * 2 }, (_, index) => manager.start({
            ...request,
            executionId: `e${index}`,
        }));
        const results = await Promise.all(starts);

        expect(results.filter(({ kind }) => kind === 'started')).toHaveLength(MAX_CONCURRENT_EXECUTIONS);
        expect(results.filter(({ kind }) => kind === 'busy')).toHaveLength(MAX_CONCURRENT_EXECUTIONS);
        expect(run).toHaveBeenCalledTimes(MAX_CONCURRENT_EXECUTIONS);

        pending.resolve(result);
        await manager.idle();

        await expect(manager.start({
            ...request,
            executionId: 'after',
        })).resolves.toMatchObject({ kind: 'started' });
        await manager.idle();
    });

    it('gives the slot back when a start loses the race for its ID', async () => {
        const createNow = store.create;

        store.create = () => Promise.resolve(false);

        for (let index = 0; index <= MAX_CONCURRENT_EXECUTIONS; index += 1) {
            await expect(manager.start({
                ...request,
                executionId: `lost${index}`,
            })).resolves.toEqual({ kind: 'conflict' });
        }

        store.create = createNow;
        run.mockResolvedValue(result);

        await expect(manager.start(request)).resolves.toMatchObject({ kind: 'started' });
        await manager.idle();
    });

    it('answers hosts-unavailable without saving anything when the node list cannot be read', async () => {
        manager = createExecutionManager({
            store,
            hosts: createHostResolver({
                localHost: 'hetzner',
                sshUser: 'root',
                listNodes: () => Promise.reject(new Error('kubectl failed')),
            }),
            run,
            logger,
            now: () => NOW,
        });

        await expect(manager.start({
            ...request,
            host: 'senaev-madrid',
        })).resolves.toEqual({ kind: 'hosts-unavailable' });
        expect(store.records.size).toBe(0);
        expect(run).not.toHaveBeenCalled();
    });

    it('returns a saved execution again even when its host can no longer be resolved', async () => {
        run.mockResolvedValue(result);
        await manager.start({
            ...request,
            host: 'senaev-madrid',
        });
        await manager.idle();

        const removed = createExecutionManager({
            store,
            hosts: createHostResolver({
                localHost: 'hetzner',
                sshUser: 'root',
                listNodes: () => Promise.reject(new Error('kubectl failed')),
            }),
            run,
            logger,
            now: () => NOW,
        });

        await expect(removed.start({
            ...request,
            host: 'senaev-madrid',
        })).resolves.toMatchObject({
            kind: 'existing',
            record: { status: 'completed' },
        });
        expect(run).toHaveBeenCalledOnce();
    });

    it('keeps a result the store failed to save, serves it, and saves it on the next read', async () => {
        const update = vi.spyOn(store, 'update').mockRejectedValueOnce(new Error('disk full'));

        run.mockResolvedValue(result);
        await manager.start(request);
        await manager.idle();

        expect(store.records.get('e1')?.status).toBe('running');
        await expect(manager.get('e1')).resolves.toMatchObject({ status: 'completed' });
        expect(update).toHaveBeenCalledTimes(2);
        expect(store.records.get('e1')?.status).toBe('completed');
        await expect(manager.start(request)).resolves.toMatchObject({
            kind: 'existing',
            record: { status: 'completed' },
        });
    });

    it('saves a command that cannot start as failed', async () => {
        run.mockRejectedValue(new Error('spawn nsenter ENOENT'));

        await manager.start(request);
        await manager.idle();

        expect(store.records.get('e1')).toMatchObject({
            status: 'failed',
            error: 'spawn nsenter ENOENT',
        });
    });

    it('saves a command killed at its deadline as failed, with its output', async () => {
        run.mockResolvedValue({
            ...result,
            exitCode: null,
            signal: 'SIGKILL',
            deadlineExceeded: true,
        });

        await manager.start(request);
        await manager.idle();

        expect(store.records.get('e1')).toMatchObject({
            status: 'failed',
            signal: 'SIGKILL',
            stdout: 'hetzner\n',
        });
    });

    it('logs neither the command nor its output', async () => {
        run.mockResolvedValue({
            ...result,
            stdout: 'secret-output',
        });

        await manager.start({
            ...request,
            command: 'echo secret-command',
        });
        await manager.idle();

        expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/secret/);
    });
});

describe('markInterruptedExecutions', () => {
    const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

    it('marks the records left running by an earlier process as interrupted', async () => {
        store.records.set('old', {
            executionId: 'old',
            host: 'hetzner',
            requestHash: 'hash',
            status: 'running',
            startedAt: NOW.toISOString(),
            endsBy: later(100).toISOString(),
        });
        store.records.set('older', {
            executionId: 'older',
            host: 'hetzner',
            requestHash: 'hash',
            status: 'running',
            startedAt: NOW.toISOString(),
            endsBy: later(-1).toISOString(),
        });
        store.records.set('done', {
            executionId: 'done',
            host: 'hetzner',
            requestHash: 'hash',
            status: 'completed',
            startedAt: NOW.toISOString(),
            endsBy: later(500).toISOString(),
        });

        await expect(markInterruptedExecutions(store, logger, NOW)).resolves.toEqual(later(100));
        expect(store.records.get('old')?.status).toBe('interrupted');
        expect(store.records.get('older')?.status).toBe('interrupted');
        expect(store.records.get('done')?.status).toBe('completed');
    });

    it('returns nothing when no interrupted command can still run', async () => {
        await expect(markInterruptedExecutions(store, logger, NOW)).resolves.toBeUndefined();
    });

    it('keeps new commands out until an interrupted command can no longer run', async () => {
        let clock = NOW;

        manager = createExecutionManager({
            store,
            hosts: createHostResolver({
                localHost: 'hetzner',
                sshUser: 'root',
                listNodes: () => Promise.resolve(['hetzner']),
            }),
            run,
            logger,
            busyUntil: later(100),
            now: () => clock,
        });
        run.mockResolvedValue(result);

        await expect(manager.start(request)).resolves.toEqual({ kind: 'busy' });
        expect(store.records.size).toBe(0);

        clock = later(100);
        await expect(manager.start(request)).resolves.toMatchObject({ kind: 'started' });
    });
});
