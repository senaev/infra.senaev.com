import {
    describe, expect, it, vi,
} from 'vitest';

import { createCommandExecution } from './CommandExecution';

describe('neutral command execution', () => {
    it('observes cancellation arriving while a checkpoint yields', async () => {
        const controller = new AbortController();
        const execution = createCommandExecution({ signal: controller.signal });
        const reason = new Error('cancelled while yielding');
        const checkpoint = execution.checkpoint();

        controller.abort(reason);
        await expect(checkpoint).rejects.toBe(reason);
    });

    it('keeps cancellation, logs and publication observers independent between invocations', async () => {
        const controller = new AbortController();
        const firstLog = vi.fn();
        const secondLog = vi.fn();
        const firstChange = vi.fn();
        const secondChange = vi.fn();
        const first = createCommandExecution({
            signal: controller.signal,
            log: firstLog,
            changedPath: firstChange,
        });
        const second = createCommandExecution({
            log: secondLog,
            changedPath: secondChange,
        });

        first.log('stdout', 'first');
        second.log('stderr', 'second');
        first.changedPath('first.md');
        second.changedPath('second.md');
        controller.abort(new Error('first only'));
        expect(() => first.throwIfAborted()).toThrow('first only');
        await second.checkpoint();
        expect(firstLog.mock.calls).toEqual([
            [
                'stdout',
                'first',
            ],
        ]);
        expect(secondLog.mock.calls).toEqual([
            [
                'stderr',
                'second',
            ],
        ]);
        expect(firstChange.mock.calls).toEqual([['first.md']]);
        expect(secondChange.mock.calls).toEqual([['second.md']]);
    });
});
