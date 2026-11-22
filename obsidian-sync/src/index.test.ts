import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => {
    return {
        setup: vi.fn(),
        serve: vi.fn(),
        continuous: vi.fn(),
        background: vi.fn(),
        closeServer: vi.fn(),
        closeBackground: vi.fn(),
        logger: { error: vi.fn() },
    };
});

vi.mock('./logger', () => {
    return { logger: mocks.logger };
});
vi.mock('./obsidian-cli/setUpVaultSync', () => {
    return { setUpVaultSync: mocks.setup };
});
vi.mock('./obsidian-cli/runContinuousSync', () => {
    return { runContinuousSync: mocks.continuous };
});
vi.mock('./server/runVaultServer', () => {
    return { runVaultServer: mocks.serve };
});
vi.mock('./telegram-post-sync/startTelegramPostSync', () => {
    return { startTelegramPostSyncInBackground: mocks.background };
});

function completion() {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });

    return {
        promise,
        resolve,
    };
}

function observeExit() {
    const exited = completion();
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
        exited.resolve();

        return undefined as never;
    });

    return {
        exit,
        finished: exited.promise,
    };
}

let started = completion();
let serverClosed = completion();
const shutdownSignals = [
    'SIGTERM',
    'SIGINT',
] as const;
const originalSignals = new Map<typeof shutdownSignals[number], Set<unknown>>();

beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    for (const signal of shutdownSignals) {
        originalSignals.set(signal, new Set(process.listeners(signal)));
    }

    mocks.setup.mockResolvedValue(undefined);
    mocks.serve.mockResolvedValue({ close: mocks.closeServer });
    started = completion();
    serverClosed = completion();
    mocks.closeServer.mockImplementation(() => {
        serverClosed.resolve();

        return Promise.resolve();
    });
    mocks.closeBackground.mockResolvedValue(undefined);
    mocks.background.mockReturnValue({ close: mocks.closeBackground });
    mocks.continuous.mockImplementation((signal: AbortSignal) => new Promise<void>((resolve) => {
        started.resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
    }));
});

afterEach(() => {
    for (const signal of shutdownSignals) {
        for (const listener of process.listeners(signal)) {
            if (!originalSignals.get(signal)?.has(listener)) {
                process.removeListener(signal, listener);
            }
        }
    }

    vi.restoreAllMocks();
    vi.useRealTimers();
});

function stop() {
    const listener = process.listeners('SIGTERM').find((candidate) => !originalSignals.get('SIGTERM')?.has(candidate));

    expect(listener).toBeDefined();
    listener?.('SIGTERM');
}

describe('Obsidian process wiring', () => {
    it('closes the HTTP manager and drains background work before exiting on a signal', async () => {
        const { exit, finished } = observeExit();
        let release: () => void = () => undefined;

        mocks.closeBackground.mockReturnValue(new Promise<void>((resolve) => {
            release = resolve;
        }));
        await import('./index.js');
        await started.promise;
        expect(mocks.continuous).toHaveBeenCalledTimes(1);
        stop();
        await serverClosed.promise;
        expect(mocks.closeServer).toHaveBeenCalledTimes(1);
        expect(mocks.continuous.mock.calls[0]?.[0].aborted).toBe(true);
        expect(exit).not.toHaveBeenCalled();
        release();
        await finished;
        expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    });

    it('waits for startup cleanup and never opens the server after a startup signal', async () => {
        const { exit, finished } = observeExit();
        let release: () => void = () => undefined;

        mocks.setup.mockReturnValue(new Promise<void>((resolve) => {
            release = resolve;
        }));
        await import('./index.js');
        expect(mocks.setup).toHaveBeenCalledTimes(1);
        stop();
        await Promise.resolve();
        expect(exit).not.toHaveBeenCalled();
        release();
        await finished;
        expect(exit).toHaveBeenCalledExactlyOnceWith(0);
        expect(mocks.serve).not.toHaveBeenCalled();
    });

    it('closes resources when continuous sync fails', async () => {
        const { exit, finished } = observeExit();

        mocks.continuous.mockRejectedValue(new Error('sync died'));
        await import('./index.js');
        await finished;
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
        expect(mocks.closeServer).toHaveBeenCalledTimes(1);
        expect(mocks.closeBackground).toHaveBeenCalledTimes(1);
    });

    it('exits with an error after ten seconds if cleanup hangs', async () => {
        vi.useFakeTimers({
            toFake: [
                'setTimeout',
                'clearTimeout',
            ],
        });
        const { exit, finished } = observeExit();
        const backgroundClosed = completion();

        mocks.closeBackground.mockReturnValue(backgroundClosed.promise);
        await import('./index.js');
        await started.promise;
        stop();

        await vi.advanceTimersByTimeAsync(9999);
        expect(exit).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await finished;
        backgroundClosed.resolve();

        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
        expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
            new Error('Service cleanup exceeded shutdown grace'),
            '❌ Obsidian shutdown failed'
        );
    });
});
