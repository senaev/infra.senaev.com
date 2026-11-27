import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import type { NodeCommand } from './buildNodeCommand';
import {
    createExecutionManager, type ExecutionManager, markInterruptedExecutions, MAX_CONCURRENT_EXECUTIONS,
} from './executionManager';
import type { ExecutionRecord } from './executionRecord';
import type { ExecutionStore } from './executionStore';
import { resolveHost } from './nodeHosts';
import type { CommandResult } from './runCommand';

vi.mock('./nodeHosts', () => {
    return {
        resolveHost: vi.fn(),
        hostTarget: (host: string) => (host === 'hetzner'
            ? { kind: 'local' }
            : {
                kind: 'ssh',
                destination: `root@${host}`,
            }),
    };
});

// The command and the store answer at once: one macrotask lets every started command end.
const settle = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    store = createMemoryStore();
    run = vi.fn();
    vi.mocked(resolveHost).mockReset().mockImplementation((host) => Promise.resolve(({
        hetzner: { kind: 'local' },
        'senaev-madrid': {
            kind: 'ssh',
            destination: 'root@senaev-madrid',
        },
    } as const)[host]));
    manager = createExecutionManager({
        store,
        run,
        logger,
        busyUntil: undefined,
    });
});

afterEach(() => {
    vi.useRealTimers();
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
        await settle();

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
        await settle();

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
        await settle();
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
        await settle();

        await expect(manager.start({
            ...request,
            executionId: 'after',
        })).resolves.toMatchObject({ kind: 'started' });
        await settle();
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
        await settle();
    });

    it('answers hosts-unavailable without saving anything when the node list cannot be read', async () => {
        vi.mocked(resolveHost).mockRejectedValue(new Error('kubectl failed'));

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
        await settle();

        vi.mocked(resolveHost).mockRejectedValue(new Error('kubectl failed'));

        await expect(manager.start({
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
        await settle();

        expect(store.records.get('e1')?.status).toBe('running');
        await expect(manager.get('e1')).resolves.toMatchObject({ status: 'completed' });
        expect(update).toHaveBeenCalledTimes(2);
        expect(store.records.get('e1')?.status).toBe('completed');
        await expect(manager.start(request)).resolves.toMatchObject({
            kind: 'existing',
            record: { status: 'completed' },
        });
    });

    it('holds the slot until endsBy when ssh ends without the exit of the command', async () => {
        const remote = {
            ...request,
            host: 'senaev-madrid',
        };

        manager = createExecutionManager({
            store,
            run,
            logger,
            busyUntil: undefined,
        });
        run.mockResolvedValueOnce({
            ...result,
            exitCode: 255,
        }).mockResolvedValue(result);

        const started = await manager.start(remote);

        await settle();
        expect(started).toMatchObject({ kind: 'started' });

        const endsBy = new Date(started.kind === 'started' ? started.record.endsBy : 0);

        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toEqual({ kind: 'busy' });

        vi.setSystemTime(endsBy);
        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toMatchObject({ kind: 'started' });
        await settle();

        // A local command, or a remote one with its own exit code, frees the slot at once.
        await expect(manager.start({
            ...remote,
            executionId: 'e3',
        })).resolves.toMatchObject({ kind: 'started' });
        await settle();
        await expect(manager.start({
            ...request,
            executionId: 'e4',
        })).resolves.toMatchObject({ kind: 'started' });
    });

    it('holds the slot when a signal ends a local command', async () => {
        run.mockResolvedValueOnce({
            ...result,
            exitCode: null,
            signal: 'SIGTERM',
        });

        await manager.start(request);
        await settle();

        expect(store.records.get('e1')).toMatchObject({ mayStillRun: true });
        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toEqual({ kind: 'busy' });
    });

    it('gives the command only what is left of its timeout after a slow save', async () => {
        const create = store.create.bind(store);

        vi.spyOn(store, 'create').mockImplementation((record) => {
            vi.setSystemTime(NOW.getTime() + 10_000);

            return create(record);
        });
        run.mockResolvedValue(result);

        await manager.start(request);
        await settle();

        expect(run.mock.lastCall?.[0].argv).toContain('--property=RuntimeMaxSec=20');
        expect(run.mock.lastCall?.[0].deadlineMs).toBe(new Date(store.records.get('e1')?.endsBy ?? 0).getTime() - NOW.getTime() - 10_000);
    });

    it('fails without running a command whose save took longer than its timeout', async () => {
        const create = store.create.bind(store);

        vi.spyOn(store, 'create').mockImplementation((record) => {
            vi.setSystemTime(NOW.getTime() + 30_000);

            return create(record);
        });

        await manager.start(request);
        await settle();

        expect(run).not.toHaveBeenCalled();
        expect(store.records.get('e1')).toMatchObject({
            status: 'failed',
            error: 'The execution was saved too late to start the command',
        });
    });

    it('saves a command that cannot start as failed', async () => {
        run.mockRejectedValue(new Error('spawn nsenter ENOENT'));

        await manager.start(request);
        await settle();

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
        await settle();

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
        await settle();

        expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/secret/);
    });
});

describe('stop', () => {
    const isStop = (argv: readonly string[]) => argv.some((arg) => arg.includes('systemctl'));

    it('stops a running command, then saves it as stopped', async () => {
        const pending = deferred<CommandResult>();

        run.mockImplementation(({ argv }) => (isStop(argv)
            ? Promise.resolve({
                ...result,
                stdout: '',
            })
            : pending.promise));
        await manager.start(request);

        await expect(manager.stop('e1')).resolves.toMatchObject({
            kind: 'stopped',
            record: { status: 'running' },
        });
        expect(run.mock.lastCall?.[0].argv.slice(7)).toEqual([
            '/bin/sh',
            '-c',
            'touch /run/node-shell-e1.stop && systemctl stop node-shell-e1',
        ]);

        pending.resolve({
            ...result,
            exitCode: 143,
        });
        await settle();

        expect(store.records.get('e1')).toMatchObject({
            status: 'stopped',
            exitCode: 143,
            stoppedAt: NOW.toISOString(),
        });
    });

    it('holds nothing after a confirmed stop, when ssh then ends with 255', async () => {
        const pending = deferred<CommandResult>();

        run.mockImplementation(({ argv }) => (isStop(argv)
            ? Promise.resolve(result)
            : pending.promise));
        await manager.start({
            ...request,
            host: 'senaev-madrid',
        });

        await expect(manager.stop('e1')).resolves.toMatchObject({ kind: 'stopped' });
        pending.resolve({
            ...result,
            exitCode: 255,
        });
        await settle();

        expect(store.records.get('e1')).toMatchObject({ status: 'stopped' });
        expect(store.records.get('e1')).not.toHaveProperty('mayStillRun');
        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toMatchObject({ kind: 'started' });
    });

    it('stops a unit whose ssh dropped while its result is being saved, and releases the hold', async () => {
        const saved = deferred<undefined>();
        const { update } = store;

        store.update = async (record) => {
            if (record.status === 'completed') {
                await saved.promise;
            }

            return update(record);
        };

        run.mockImplementation(({ argv }) => Promise.resolve(isStop(argv)
            ? result
            : {
                ...result,
                exitCode: 255,
            }));
        await manager.start({
            ...request,
            host: 'senaev-madrid',
        });
        await settle();

        const stopped = manager.stop('e1');

        await settle();
        saved.resolve(undefined);

        await expect(stopped).resolves.toMatchObject({ kind: 'stopped' });
        expect(store.records.get('e1')).toMatchObject({
            status: 'completed',
            stoppedAt: NOW.toISOString(),
        });
        expect(store.records.get('e1')).not.toHaveProperty('mayStillRun');
        await settle();
        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toMatchObject({ kind: 'started' });
    });

    it('keeps a confirmed stop when the same stop is asked for again', async () => {
        const pending = deferred<CommandResult>();

        run.mockImplementation(({ argv }) => (isStop(argv)
            ? Promise.resolve(result)
            : pending.promise));
        await manager.start({
            ...request,
            host: 'senaev-madrid',
        });

        await expect(manager.stop('e1')).resolves.toMatchObject({ kind: 'stopped' });
        run.mockImplementation(() => Promise.resolve({
            ...result,
            exitCode: 255,
        }));
        await expect(manager.stop('e1')).resolves.toMatchObject({ kind: 'stopped' });
        pending.resolve({
            ...result,
            exitCode: 255,
        });
        await settle();

        expect(store.records.get('e1')).toMatchObject({ status: 'stopped' });
        expect(store.records.get('e1')).not.toHaveProperty('mayStillRun');
        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toMatchObject({ kind: 'started' });
    });

    it('stops a command whose record is still being created', async () => {
        const created = deferred<undefined>();
        const { create } = store;

        store.create = async (record) => {
            const isNew = await create(record);

            await created.promise;

            return isNew;
        };

        run.mockImplementation(({ argv }) => Promise.resolve(isStop(argv)
            ? {
                ...result,
                exitCode: 5,
            }
            : {
                ...result,
                exitCode: 143,
            }));

        const started = manager.start(request);

        await settle();
        await expect(manager.stop('e1')).resolves.toMatchObject({ kind: 'stopped' });
        created.resolve(undefined);
        await started;
        await settle();

        expect(store.records.get('e1')).toMatchObject({
            status: 'stopped',
            stoppedAt: NOW.toISOString(),
        });
    });

    it('treats a unit that is already gone as stopped', async () => {
        const pending = deferred<CommandResult>();

        run.mockImplementation(({ argv }) => (isStop(argv)
            ? Promise.resolve({
                ...result,
                exitCode: 5,
            })
            : pending.promise));
        await manager.start(request);

        await expect(manager.stop('e1')).resolves.toMatchObject({ kind: 'stopped' });
        pending.resolve(result);
        await settle();
    });

    it('answers stop-failed when systemctl fails, and keeps the command running', async () => {
        const pending = deferred<CommandResult>();

        run.mockImplementation(({ argv }) => (isStop(argv)
            ? Promise.resolve({
                ...result,
                exitCode: 255,
            })
            : pending.promise));
        await manager.start({
            ...request,
            host: 'senaev-madrid',
        });

        await expect(manager.stop('e1')).resolves.toEqual({ kind: 'stop-failed' });
        expect(store.records.get('e1')?.status).toBe('running');
        pending.resolve(result);
        await settle();

        expect(store.records.get('e1')?.status).toBe('completed');
        expect(store.records.get('e1')).not.toHaveProperty('stoppedAt');
    });

    it('runs nothing for a finished execution, and answers not-found for an unknown one', async () => {
        run.mockResolvedValue(result);
        await manager.start(request);
        await settle();
        run.mockClear();

        await expect(manager.stop('e1')).resolves.toMatchObject({
            kind: 'not-running',
            record: { status: 'completed' },
        });
        await expect(manager.stop('unknown')).resolves.toEqual({ kind: 'not-found' });
        expect(run).not.toHaveBeenCalled();
    });

    it('stops the unit of an earlier process that may still run, then lets new commands start', async () => {
        const endsBy = new Date(NOW.getTime() + 60_000);

        store.records.set('old', {
            executionId: 'old',
            host: 'senaev-madrid',
            requestHash: 'hash',
            status: 'interrupted',
            startedAt: NOW.toISOString(),
            endsBy: endsBy.toISOString(),
            mayStillRun: true,
        });
        manager = createExecutionManager({
            store,
            run,
            logger,
            busyUntil: endsBy,
        });
        run.mockResolvedValue(result);

        await expect(manager.start(request)).resolves.toEqual({ kind: 'busy' });
        await expect(manager.stop('old')).resolves.toMatchObject({ kind: 'stopped' });
        expect(run.mock.lastCall?.[0].argv.slice(-3)).toEqual([
            'root@senaev-madrid',
            '--',
            '\'/bin/sh\' \'-c\' \'touch /run/node-shell-old.stop && systemctl stop node-shell-old\'',
        ]);
        expect(store.records.get('old')).toMatchObject({
            status: 'interrupted',
            stoppedAt: NOW.toISOString(),
        });
        expect(store.records.get('old')).not.toHaveProperty('mayStillRun');
        await expect(manager.start(request)).resolves.toMatchObject({ kind: 'started' });
    });

    it('keeps new commands out when the stop of an earlier unit fails', async () => {
        const endsBy = new Date(NOW.getTime() + 60_000);

        store.records.set('old', {
            executionId: 'old',
            host: 'senaev-madrid',
            requestHash: 'hash',
            status: 'interrupted',
            startedAt: NOW.toISOString(),
            endsBy: endsBy.toISOString(),
            mayStillRun: true,
        });
        manager = createExecutionManager({
            store,
            run,
            logger,
            busyUntil: endsBy,
        });
        run.mockResolvedValue({
            ...result,
            exitCode: 255,
        });

        await expect(manager.stop('old')).resolves.toEqual({ kind: 'stop-failed' });
        expect(store.records.get('old')?.mayStillRun).toBe(true);
        await expect(manager.start(request)).resolves.toEqual({ kind: 'busy' });
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

        await expect(markInterruptedExecutions(store, logger)).resolves.toEqual(later(100));
        expect(store.records.get('old')).toMatchObject({
            status: 'interrupted',
            mayStillRun: true,
        });
        expect(store.records.get('older')?.status).toBe('interrupted');
        expect(store.records.get('done')?.status).toBe('completed');
    });

    it('keeps the hold over later restarts, also for a dropped ssh connection', async () => {
        store.records.set('old', {
            executionId: 'old',
            host: 'hetzner',
            requestHash: 'hash',
            status: 'running',
            startedAt: NOW.toISOString(),
            endsBy: later(100).toISOString(),
        });
        store.records.set('dropped', {
            executionId: 'dropped',
            host: 'senaev-madrid',
            requestHash: 'hash',
            status: 'completed',
            startedAt: NOW.toISOString(),
            endsBy: later(200).toISOString(),
            exitCode: 255,
            mayStillRun: true,
        });

        await expect(markInterruptedExecutions(store, logger)).resolves.toEqual(later(200));
        store.records.delete('dropped');
        await expect(markInterruptedExecutions(store, logger)).resolves.toEqual(later(100));
        vi.setSystemTime(later(100));
        await expect(markInterruptedExecutions(store, logger)).resolves.toBeUndefined();
    });

    it('saves mayStillRun for a remote command whose ssh ended with 255', async () => {
        run.mockResolvedValue({
            ...result,
            exitCode: 255,
        });
        await manager.start({
            ...request,
            host: 'senaev-madrid',
        });
        await settle();

        expect(store.records.get('e1')).toMatchObject({
            status: 'completed',
            mayStillRun: true,
        });
        await expect(markInterruptedExecutions(store, logger)).resolves.toEqual(new Date(store.records.get('e1')?.endsBy ?? 0));
    });

    it('returns nothing when no interrupted command can still run', async () => {
        await expect(markInterruptedExecutions(store, logger)).resolves.toBeUndefined();
    });

    it('keeps new commands out until an interrupted command can no longer run', async () => {
        manager = createExecutionManager({
            store,
            run,
            logger,
            busyUntil: later(100),
        });
        run.mockResolvedValue(result);

        await expect(manager.start(request)).resolves.toEqual({ kind: 'busy' });
        expect(store.records.size).toBe(0);

        vi.setSystemTime(later(100));
        await expect(manager.start(request)).resolves.toMatchObject({ kind: 'started' });
    });
});
