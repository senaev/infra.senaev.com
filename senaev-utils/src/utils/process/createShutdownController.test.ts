import { EventEmitter } from 'node:events';

import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { createShutdownController } from './createShutdownController';

function createFakeProcess() {
    let exited: (code: number) => void = () => undefined;
    const exitCode = new Promise<number>((resolve) => {
        exited = resolve;
    });

    return Object.assign(new EventEmitter(), {
        exit: vi.fn((code: number) => exited(code)),
        exitCode,
    });
}

afterEach(() => {
    vi.useRealTimers();
});

describe('createShutdownController', () => {
    it('closes in the reverse order, awaiting each closer, then exits with 0', async () => {
        const process = createFakeProcess();
        const { subscribeShutdown } = createShutdownController({
            process,
            reportError: vi.fn(),
        });
        const events: string[] = [];
        let finishSecond: () => void = () => undefined;
        let secondStarted: () => void = () => undefined;
        const secondHasStarted = new Promise<void>((resolve) => {
            secondStarted = resolve;
        });

        subscribeShutdown(() => {
            events.push('first');
        });
        subscribeShutdown(() => new Promise<void>((resolve) => {
            secondStarted();
            finishSecond = () => {
                events.push('second');
                resolve();
            };
        }));
        subscribeShutdown(() => {
            events.push('third');
        });

        process.emit('SIGTERM');
        await secondHasStarted;

        expect(events).toEqual(['third']);
        expect(process.exit).not.toHaveBeenCalled();

        finishSecond();

        expect(await process.exitCode).toBe(0);
        expect(events).toEqual([
            'third',
            'second',
            'first',
        ]);
    });

    it('reports a closer that throws, still runs the others, and exits with 1', async () => {
        const process = createFakeProcess();
        const reportError = vi.fn(() => {
            throw new Error('diagnostics failed');
        });
        const { subscribeShutdown } = createShutdownController({
            process,
            reportError,
        });
        const closeFirst = vi.fn();
        const failure = new Error('close failed');

        subscribeShutdown(closeFirst);
        subscribeShutdown(() => {
            throw failure;
        });

        process.emit('SIGINT');

        expect(await process.exitCode).toBe(1);
        expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
        expect(closeFirst).toHaveBeenCalledTimes(1);
    });

    it('shares one cleanup across repeated and mixed signals', async () => {
        const process = createFakeProcess();
        const { subscribeShutdown } = createShutdownController({
            process,
            reportError: vi.fn(),
        });
        const close = vi.fn();

        subscribeShutdown(close);
        process.emit('SIGTERM');
        expect(process.emit('SIGTERM')).toBe(true);
        process.emit('SIGINT');
        await process.exitCode;

        expect(process.exit).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('leaves a repeated signal to the default handler when configured', async () => {
        const process = createFakeProcess();

        createShutdownController({
            process,
            reportError: vi.fn(),
            forceExitOnRepeatedSignal: true,
        });

        expect(process.listenerCount('SIGTERM')).toBe(1);
        expect(process.listenerCount('SIGINT')).toBe(1);

        process.emit('SIGTERM');

        expect(process.listenerCount('SIGTERM')).toBe(0);
        await process.exitCode;
    });

    it('aborts before cleanup and shares an explicit shutdown with reentrant callers', async () => {
        const process = createFakeProcess();
        const {
            signal, shutdown, subscribeShutdown,
        } = createShutdownController({
            process,
            reportError: vi.fn(),
        });
        let reentrant: Promise<void> | undefined;
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const close = vi.fn(() => gate);

        subscribeShutdown(close);
        signal.addEventListener('abort', () => {
            reentrant = shutdown();
        });
        const pending = shutdown(1);

        expect(shutdown()).toBe(pending);
        await Promise.resolve();
        expect(signal.aborted).toBe(true);
        expect(reentrant).toBe(pending);
        expect(close).toHaveBeenCalledTimes(1);
        expect(process.exit).not.toHaveBeenCalled();
        release();
        await pending;

        expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
        expect(process.listenerCount('SIGTERM')).toBe(0);
        expect(process.listenerCount('SIGINT')).toBe(0);
    });

    it('exits once after the ten-second default grace if cleanup hangs', async () => {
        vi.useFakeTimers({
            toFake: [
                'setTimeout',
                'clearTimeout',
            ],
        });
        const process = createFakeProcess();
        const reportError = vi.fn(() => {
            throw new Error('diagnostics failed');
        });
        const { shutdown, subscribeShutdown } = createShutdownController({
            process,
            reportError,
        });
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        subscribeShutdown(() => gate);
        const pending = shutdown();

        await vi.advanceTimersByTimeAsync(9999);
        expect(process.exit).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await pending;
        release();
        await gate;

        expect(reportError).toHaveBeenCalledExactlyOnceWith(new Error('Service cleanup exceeded shutdown grace'));
        expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('waits past the default grace when configured to drain all callbacks', async () => {
        vi.useFakeTimers({
            toFake: [
                'setTimeout',
                'clearTimeout',
            ],
        });
        const process = createFakeProcess();
        const { shutdown, subscribeShutdown } = createShutdownController({
            process,
            reportError: vi.fn(),
            graceMs: null,
        });
        let release: () => void = () => undefined;

        subscribeShutdown(() => new Promise<void>((resolve) => {
            release = resolve;
        }));
        const pending = shutdown();

        await vi.advanceTimersByTimeAsync(10000);
        expect(process.exit).not.toHaveBeenCalled();
        release();
        await pending;
        expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
    });
});
