import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import type { NodeCommand } from './buildNodeCommand';
import { ExecutionManager, MAX_CONCURRENT_EXECUTIONS } from './executionManager';
import { type HostTarget, resolveHost } from './nodeHosts';
import { type CommandResult, runCommand } from './runCommand';

vi.mock('./runCommand', () => {
    return { runCommand: vi.fn() };
});
vi.mock('./nodeHosts', () => {
    return {
        resolveHost: vi.fn(),
    };
});

// The command answers at once: one macrotask lets every started command end.
const settle = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

const NOW = new Date('2026-11-22T10:00:00.000Z');

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

const run = vi.mocked(runCommand);
let manager: ExecutionManager;
const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
};

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    run.mockReset();
    vi.mocked(resolveHost).mockReset().mockImplementation((host) => Promise.resolve(new Map<string, HostTarget>([
        [
            'hetzner',
            { kind: 'local' },
        ],
        [
            'senaev-madrid',
            {
                kind: 'ssh',
                destination: 'root@senaev-madrid',
            },
        ],
    ]).get(host)));
    manager = new ExecutionManager({ logger });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ExecutionManager', () => {
    it('records the execution as running before the command, then the result', async () => {
        const pending = deferred<CommandResult>();

        run.mockImplementation(() => {
            expect(manager.get('e1')?.status).toBe('running');

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

        expect(manager.get('e1')).toMatchObject({
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

    it('runs one command when two starts of the same ID arrive at once', async () => {
        const pending = deferred<CommandResult>();

        run.mockReturnValue(pending.promise);

        const results = await Promise.all([
            manager.start(request),
            manager.start(request),
        ]);

        expect(results.map(({ kind }) => kind).sort()).toEqual([
            'existing',
            'started',
        ]);
        expect(run).toHaveBeenCalledOnce();

        pending.resolve(result);
        await settle();
    });

    it('refuses an unknown host without recording anything', async () => {
        await expect(manager.start({
            ...request,
            host: 'galkin',
        })).resolves.toEqual({ kind: 'unknown-host' });
        expect(manager.get('e1')).toBeUndefined();
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
        expect(manager.get('one-more')).toBeUndefined();

        pending.resolve(result);
        await settle();
    });

    it('keeps the limit when many starts arrive at once', async () => {
        const pending = deferred<CommandResult>();

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
    it('answers hosts-unavailable without recording anything when the node list cannot be read', async () => {
        vi.mocked(resolveHost).mockRejectedValue(new Error('kubectl failed'));

        await expect(manager.start({
            ...request,
            host: 'senaev-madrid',
        })).resolves.toEqual({ kind: 'hosts-unavailable' });
        expect(manager.get('e1')).toBeUndefined();
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

    it('records a remote command whose ssh ended with 255 as failed, and frees the slot at once', async () => {
        run.mockResolvedValueOnce({
            ...result,
            exitCode: 255,
        }).mockResolvedValue(result);

        const started = await manager.start({
            ...request,
            host: 'senaev-madrid',
        });

        await settle();

        expect(manager.get('e1')).toMatchObject({
            status: 'failed',
            exitCode: 255,
            error: `ssh exited with 255: the connection failed, or the command exited with 255; it may still run on the host until ${started.kind === 'started' ? started.record.endsBy : ''}`,
        });
        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toMatchObject({ kind: 'started' });
    });

    it('records a command whose wait a signal ended as failed', async () => {
        run.mockResolvedValueOnce({
            ...result,
            exitCode: null,
            signal: 'SIGTERM',
        });

        await manager.start(request);
        await settle();

        expect(manager.get('e1')).toMatchObject({
            status: 'failed',
            signal: 'SIGTERM',
            error: expect.stringMatching(/^A signal ended the wait for the command; it may still run on the host until /) as unknown,
        });
    });

    it('gives the command its whole timeout', async () => {
        run.mockResolvedValue(result);

        await manager.start(request);
        await settle();

        expect(run.mock.lastCall?.[0].argv).toContain('--property=RuntimeMaxSec=30');
        expect(run.mock.lastCall?.[0].deadlineMs).toBe(30_000 + 70_000);
        expect(manager.get('e1')?.status).toBe('completed');
    });

    it('records a command that cannot start as failed', async () => {
        run.mockRejectedValue(new Error('spawn nsenter ENOENT'));

        await manager.start(request);
        await settle();

        expect(manager.get('e1')).toMatchObject({
            status: 'failed',
            error: 'spawn nsenter ENOENT',
        });
    });

    it('records a command killed at its deadline as failed, with its output', async () => {
        run.mockResolvedValue({
            ...result,
            exitCode: null,
            signal: 'SIGKILL',
            deadlineExceeded: true,
        });

        await manager.start(request);
        await settle();

        expect(manager.get('e1')).toMatchObject({
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

    it('stops a running command, then records it as stopped', async () => {
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
            'touch \'/run/node-shell-e1.stop\' && systemctl stop node-shell-e1',
        ]);

        pending.resolve({
            ...result,
            exitCode: 143,
        });
        await settle();

        expect(manager.get('e1')).toMatchObject({
            status: 'stopped',
            exitCode: 143,
            stoppedAt: NOW.toISOString(),
        });
    });

    it('records a confirmed stop as stopped, also when ssh then ends with 255', async () => {
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

        expect(manager.get('e1')).toMatchObject({ status: 'stopped' });
        expect(manager.get('e1')).not.toHaveProperty('error');
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

        expect(manager.get('e1')).toMatchObject({ status: 'stopped' });
        await expect(manager.start({
            ...request,
            executionId: 'e2',
        })).resolves.toMatchObject({ kind: 'started' });
    });
    it('tries a stop again when the last one failed', async () => {
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
        run.mockImplementation(({ argv }) => (isStop(argv) ? Promise.resolve(result) : pending.promise));
        await expect(manager.stop('e1')).resolves.toMatchObject({ kind: 'stopped' });
        expect(run.mock.calls.filter(([{ argv }]) => isStop(argv))).toHaveLength(2);

        pending.resolve({
            ...result,
            exitCode: 143,
        });
        await settle();

        expect(manager.get('e1')).toMatchObject({ status: 'stopped' });
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
        expect(manager.get('e1')?.status).toBe('running');
        pending.resolve(result);
        await settle();

        expect(manager.get('e1')?.status).toBe('completed');
        expect(manager.get('e1')).not.toHaveProperty('stoppedAt');
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
});

describe('removeFinishedOlderThan', () => {
    it('forgets only the commands that finished before the retention', async () => {
        const pending = deferred<CommandResult>();

        run.mockResolvedValueOnce(result).mockReturnValue(pending.promise);
        await manager.start(request);
        await settle();
        vi.setSystemTime(NOW.getTime() + 60_000);
        await manager.start({
            ...request,
            executionId: 'e2',
        });

        expect(manager.removeFinishedOlderThan(60_000, new Date(NOW.getTime() + 60_000))).toBe(0);
        expect(manager.removeFinishedOlderThan(59_999, new Date(NOW.getTime() + 60_000))).toBe(1);
        expect(manager.get('e1')).toBeUndefined();
        expect(manager.get('e2')?.status).toBe('running');

        pending.resolve(result);
        await settle();
    });
});
