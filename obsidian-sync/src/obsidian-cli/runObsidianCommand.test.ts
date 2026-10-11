import { EventEmitter } from 'node:events';

import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => {
    return { spawn: vi.fn() };
});

vi.mock('node:child_process', () => {
    return { spawn: mocks.spawn };
});
vi.mock('../logger', () => {
    return { logger: { info: vi.fn() } };
});

import { runObsidianCommand } from './runObsidianCommand';

beforeEach(() => {
    vi.resetAllMocks();
});

describe('Obsidian child cleanup', () => {
    it('requests termination on abort and waits for close before finishing', async () => {
        const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
        const controller = new AbortController();

        mocks.spawn.mockReturnValue(child);
        let finished = false;
        const running = runObsidianCommand(['sync'], controller.signal).then(() => {
            finished = true;
        });

        controller.abort();
        expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
        await Promise.resolve();
        expect(finished).toBe(false);
        child.emit('close', null, 'SIGTERM');
        await running;
        expect(finished).toBe(true);
    });

    it('does not spawn when shutdown has already started', async () => {
        const controller = new AbortController();

        controller.abort(new Error('stopping'));
        await expect(runObsidianCommand(['login'], controller.signal)).rejects.toThrow('stopping');
        expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it('removes its abort listener after a normal exit', async () => {
        const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
        const controller = new AbortController();

        mocks.spawn.mockReturnValue(child);
        const running = runObsidianCommand(['sync'], controller.signal);

        child.emit('close', 0, null);
        await running;
        controller.abort();
        expect(child.kill).not.toHaveBeenCalled();
    });
});
