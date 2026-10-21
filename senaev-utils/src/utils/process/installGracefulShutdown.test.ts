import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { installGracefulShutdown } from './installGracefulShutdown';

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('installGracefulShutdown', () => {
    it('aborts once and awaits cleanup before exit, including reentrant signals', async () => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const stop = vi.fn(() => gate);
        const lifecycle = installGracefulShutdown({
            stop,
            reportError: vi.fn(),
        });

        lifecycle.signal.addEventListener('abort', () => {
            void lifecycle.shutdown();
        });
        const pending = lifecycle.shutdown();

        expect(lifecycle.shutdown()).toBe(pending);
        await Promise.resolve();
        expect(lifecycle.signal.aborted).toBe(true);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(exit).not.toHaveBeenCalled();
        release();
        await pending;
        expect(exit).toHaveBeenCalledExactlyOnceWith(0);
        lifecycle.dispose();
    });

    it('reports cleanup failures and exits unsuccessfully', async () => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const error = new Error('cleanup');
        const reportError = vi.fn();
        const lifecycle = installGracefulShutdown({
            stop: () => Promise.reject(error),
            reportError,
        });

        await lifecycle.shutdown();
        expect(reportError).toHaveBeenCalledWith(error);
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('bounds uncooperative cleanup with the existing ten second process grace', async () => {
        vi.useFakeTimers({
            toFake: [
                'setTimeout',
                'clearTimeout',
            ],
        });
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        let release: () => void = () => undefined;
        const lifecycle = installGracefulShutdown({
            stop: () => new Promise<void>((resolve) => {
                release = resolve;
            }),
            reportError: vi.fn(() => {
                throw new Error('diagnostics');
            }),
        });
        const pending = lifecycle.shutdown();

        await vi.advanceTimersByTimeAsync(9999);
        expect(exit).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(exit).toHaveBeenCalledWith(1);
        release();
        await pending;
        expect(vi.getTimerCount()).toBe(0);
    });
});
