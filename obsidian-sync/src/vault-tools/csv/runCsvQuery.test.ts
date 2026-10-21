import { EventEmitter } from 'node:events';

import {
    afterEach, expect, it, vi,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { runCsvQuery, type CsvQueryInput } from './runCsvQuery';

const { spawn } = vi.hoisted(() => {
    return { spawn: vi.fn() };
});

vi.mock('node:child_process', () => {
    return { spawn };
});
const input: CsvQueryInput = {
    tables: [],
    sql: 'SELECT 1',
    params: [],
    maxRows: 1,
};

function childProcess() {
    const child = Object.assign(new EventEmitter(), {
        stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
        stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
        kill: vi.fn(),
    });

    spawn.mockReturnValue(child);

    return child;
}

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

it('uses a sanitized environment, bounded heap and restricted filesystem permissions', async () => {
    const child = childProcess();
    const pending = runCsvQuery(input, createCommandExecution());

    child.stdout.emit('data', JSON.stringify({ result: { rows: [[1]] } }));
    child.emit('close', 0);
    expect(await pending).toEqual({ rows: [[1]] });
    expect(spawn).toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
        '--permission',
        '--max-old-space-size=64',
    ]), expect.objectContaining({ env: { NODE_NO_WARNINGS: '1' } }));
});

it('kills on timeout but waits for close before settling', async () => {
    vi.useFakeTimers();
    const child = childProcess();
    const pending = runCsvQuery(input, createCommandExecution());
    const assertion = expect(pending).rejects.toThrow('5 second');
    const settled = vi.fn();

    void pending.catch(settled);
    await vi.advanceTimersByTimeAsync(4999);
    expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).not.toHaveBeenCalled();
    child.emit('close', null);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
});

it.each([
    'output',
    'stdin',
    'spawn',
    'invalid_json',
    'exit',
])('handles %s failures without leaking timers', async (mode) => {
    vi.useFakeTimers();
    const child = childProcess();
    const pending = runCsvQuery(input, createCommandExecution());
    const assertion = expect(pending).rejects.toBeInstanceOf(Error);

    if (mode === 'output') {
        child.stdout.emit('data', 'x'.repeat(263001));
    }

    if (mode === 'stdin') {
        child.stdin.emit('error', new Error('closed'));
    }

    if (mode === 'spawn') {
        child.emit('error', new Error('spawn failed'));
    }

    if (mode === 'invalid_json') {
        child.stdout.emit('data', '{');
    }

    child.emit('close', mode === 'exit' ? 1 : 0);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
});

it('kills on cancellation and does not spawn for a previously cancelled request', async () => {
    const child = childProcess();
    const controller = new AbortController();
    const execution = createCommandExecution({ signal: controller.signal });
    const pending = runCsvQuery(input, execution);
    const assertion = expect(pending).rejects.toThrow('cancelled');

    controller.abort(new Error('cancelled'));
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', null);
    await assertion;
    await expect(runCsvQuery(input, execution)).rejects.toThrow('cancelled');
    expect(spawn).toHaveBeenCalledTimes(1);
});
