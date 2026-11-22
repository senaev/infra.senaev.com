import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import type { NodeCommand } from './buildNodeCommand';
import {
    createExecutionManager, type ExecutionManager, markInterruptedExecutions, MAX_CONCURRENT_EXECUTIONS,
} from './executionManager';
import type { ExecutionRecord } from './executionRecord';
import type { ExecutionStore } from './executionStore';
import { parseNodeHosts } from './nodeHosts';
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
        hosts: parseNodeHosts('hetzner', '{"senaev-madrid":"root@senaev-madrid"}'),
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
        expect(run.mock.lastCall?.[0].argv.slice(0, 6)).toEqual([
            'nsenter',
            '--target',
            '1',
            '--all',
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
    it('marks the records left running by an earlier process as interrupted', async () => {
        store.records.set('old', {
            executionId: 'old',
            host: 'hetzner',
            requestHash: 'hash',
            status: 'running',
            startedAt: NOW.toISOString(),
        });
        store.records.set('done', {
            executionId: 'done',
            host: 'hetzner',
            requestHash: 'hash',
            status: 'completed',
            startedAt: NOW.toISOString(),
        });

        await markInterruptedExecutions(store, logger, NOW);

        expect(store.records.get('old')?.status).toBe('interrupted');
        expect(store.records.get('done')?.status).toBe('completed');
    });
});
