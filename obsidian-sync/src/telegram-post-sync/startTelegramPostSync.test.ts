import {
    beforeEach, afterEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => {
    return {
        load: vi.fn(),
        scan: vi.fn(),
        reconcile: vi.fn(),
        sync: vi.fn(),
        watch: vi.fn(),
        closeWatch: vi.fn(),
        report: vi.fn(),
    };
});

vi.mock('../logger', () => {
    return { logger: { info: vi.fn() } };
});
vi.mock('./pushedNoteHashes', () => {
    return { loadPushedNoteHashes: mocks.load };
});
vi.mock('./scanVaultForTrackedNotes', () => {
    return { scanVaultForTrackedNotes: mocks.scan };
});
vi.mock('./reconcileTrackedNotes', () => {
    return { reconcileTrackedNotes: mocks.reconcile };
});
vi.mock('./syncNoteToTelegramPost', () => {
    return { syncNoteToTelegramPost: mocks.sync };
});
vi.mock('./watchVaultForNoteChanges', () => {
    return { watchVaultForNoteChanges: mocks.watch };
});
vi.mock('./reportSyncError', () => {
    return { reportSyncError: mocks.report };
});

import { startTelegramPostSyncInBackground } from './startTelegramPostSync';

beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.scan.mockResolvedValue([]);
    mocks.sync.mockResolvedValue(undefined);
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.watch.mockReturnValue(mocks.closeWatch);
});
afterEach(() => {
    vi.useRealTimers();
});

describe('background sync cleanup', () => {
    it('stops the watcher and timer immediately and waits for in-flight work', async () => {
        const controller = new AbortController();
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const background = startTelegramPostSyncInBackground(controller.signal);

        await vi.advanceTimersByTimeAsync(0);
        const changed = mocks.watch.mock.calls[0]?.[0] as (path: string) => void;

        mocks.sync.mockReturnValue(gate);
        changed('A.md');
        controller.abort();
        expect(mocks.closeWatch).toHaveBeenCalledTimes(1);
        let drained = false;
        const closing = background.close().then(() => {
            drained = true;
        });

        await vi.advanceTimersByTimeAsync(30000);
        expect(drained).toBe(false);
        expect(mocks.reconcile).not.toHaveBeenCalled();
        changed('B.md');
        expect(mocks.sync).toHaveBeenCalledTimes(1);
        release();
        await closing;
        expect(drained).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('closing during initial scanning prevents later pushes and scheduling', async () => {
        let release: (notes: { relativePath: string }[]) => void = () => undefined;

        mocks.scan.mockReturnValue(new Promise((resolve) => {
            release = resolve;
        }));
        const background = startTelegramPostSyncInBackground(new AbortController().signal);
        const closing = background.close();

        release([{ relativePath: 'A.md' }]);
        await closing;
        expect(mocks.sync).not.toHaveBeenCalled();
        expect(mocks.closeWatch).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});
