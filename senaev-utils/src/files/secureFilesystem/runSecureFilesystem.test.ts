import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
    afterEach, beforeEach, expect, it, vi,
} from 'vitest';

import { createCommandExecution } from '../../commands/CommandExecution';

import { runSecureFilesystem } from './runSecureFilesystem';

const { spawn } = vi.hoisted(() => {
    return { spawn: vi.fn() };
});

vi.mock('node:child_process', () => {
    return { spawn };
});

let child: EventEmitter & { stdin: PassThrough; stdout: PassThrough; kill: ReturnType<typeof vi.fn> };

beforeEach(() => {
    vi.useFakeTimers();
    child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        kill: vi.fn(),
    });
    spawn.mockReturnValue(child);
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

it('inherits the verified directory and waits for close after a successful reply', async () => {
    const pending = runSecureFilesystem({ operation: 'publish' }, createCommandExecution(), 42);

    expect(spawn).toHaveBeenCalledWith('python3', expect.any(Array), expect.objectContaining({
        stdio: [
            'pipe',
            'pipe',
            'ignore',
            42,
        ],
    }));
    child.stdout.write('{"ok":true}');
    child.emit('close', 0);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
});

it.each([
    [
        'conflict',
        'conflict',
    ],
    [
        'forbidden_path',
        'forbidden_path',
    ],
    [
        'command_failed',
        'command_failed',
    ],
    [
        'unknown',
        'command_failed',
    ],
])('reports the helper error %s as %s', async (error, code) => {
    const pending = runSecureFilesystem({}, createCommandExecution());
    const rejected = expect(pending).rejects.toMatchObject({ code });

    child.stdout.write(JSON.stringify({
        error,
        message: 'rejected',
    }));
    child.emit('close', 1);
    await rejected;
});

it('kills at the deadline and reaps before rejecting', async () => {
    const pending = runSecureFilesystem({}, createCommandExecution());
    const rejected = expect(pending).rejects.toMatchObject({ code: 'command_failed' });

    vi.advanceTimersByTime(30000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', null);
    await rejected;
});

it('kills on cancellation and preserves its reason', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const pending = runSecureFilesystem({}, createCommandExecution({ signal: controller.signal }));
    const rejected = expect(pending).rejects.toBe(reason);

    controller.abort(reason);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', null);
    await rejected;
});

it('starts no process for an already cancelled request', async () => {
    const controller = new AbortController();

    controller.abort(new Error('cancelled'));
    await expect(runSecureFilesystem({}, createCommandExecution({ signal: controller.signal }))).rejects.toThrow('cancelled');
    expect(spawn).not.toHaveBeenCalled();
});

it.each([
    'malformed',
    'spawn',
    'oversized',
])('fails closed on a %s reply or process failure', async (mode) => {
    const pending = runSecureFilesystem({}, createCommandExecution());
    const rejected = expect(pending).rejects.toBeDefined();

    if (mode === 'spawn') {
        child.emit('error', new Error('cannot spawn'));
    } else {
        child.stdout.write(mode === 'oversized' ? 'x'.repeat(16001) : 'invalid json');
    }

    child.emit('close', 1);
    await rejected;
});
