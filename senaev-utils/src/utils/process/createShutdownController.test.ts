import { EventEmitter } from 'node:events';

import {
    describe, expect, it, vi,
} from 'vitest';

import { createShutdownController } from './createShutdownController';

function createFakeProcess() {
    return Object.assign(new EventEmitter(), { exit: vi.fn() });
}

describe('createShutdownController', () => {
    it('closes in the reverse order, awaiting each closer, then exits with 0', async () => {
        const process = createFakeProcess();
        const subscribeShutdown = createShutdownController(process, vi.fn());
        const events: string[] = [];
        let finishSecond: () => void = () => undefined;

        subscribeShutdown(() => {
            events.push('first');
        });
        subscribeShutdown(() => new Promise<void>((resolve) => {
            finishSecond = () => {
                events.push('second');
                resolve();
            };
        }));
        subscribeShutdown(() => {
            events.push('third');
        });

        process.emit('SIGTERM');
        await vi.waitFor(() => {
            expect(events).toEqual(['third']);
        });
        expect(process.exit).not.toHaveBeenCalled();

        finishSecond();
        await vi.waitFor(() => {
            expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
        });
        expect(events).toEqual([
            'third',
            'second',
            'first',
        ]);
    });

    it('reports a closer that throws, still runs the others, and exits with 1', async () => {
        const process = createFakeProcess();
        const reportError = vi.fn();
        const subscribeShutdown = createShutdownController(process, reportError);
        const closeFirst = vi.fn();
        const failure = new Error('close failed');

        subscribeShutdown(closeFirst);
        subscribeShutdown(() => {
            throw failure;
        });

        process.emit('SIGINT');
        await vi.waitFor(() => {
            expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
        });
        expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
        expect(closeFirst).toHaveBeenCalledTimes(1);
    });

    it('shuts down once, even when both signals arrive', async () => {
        const process = createFakeProcess();
        const subscribeShutdown = createShutdownController(process, vi.fn());
        const close = vi.fn();

        subscribeShutdown(close);
        process.emit('SIGTERM');
        process.emit('SIGINT');
        await vi.waitFor(() => {
            expect(process.exit).toHaveBeenCalledTimes(1);
        });
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('listens once for each signal, so a second signal is left to the default handler', () => {
        const process = createFakeProcess();

        createShutdownController(process, vi.fn());

        expect(process.listenerCount('SIGTERM')).toBe(1);
        expect(process.listenerCount('SIGINT')).toBe(1);

        process.emit('SIGTERM');

        expect(process.listenerCount('SIGTERM')).toBe(0);
    });
});
