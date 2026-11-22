import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => {
    return {
        setUp: vi.fn(),
        runContinuous: vi.fn(),
    };
});

vi.mock('./setUpVaultSync', () => {
    return { setUpVaultSync: mocks.setUp };
});
vi.mock('./runContinuousSync', () => {
    return { runContinuousSync: mocks.runContinuous };
});

import { createVaultSync } from './createVaultSync';

function stopOnAbort(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
    });
}

describe('createVaultSync', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('aborts the running command on close and waits until it has ended', async () => {
        mocks.runContinuous.mockImplementation(stopOnAbort);
        const sync = createVaultSync();
        const running = sync.runContinuous();

        await sync.close();
        await running;

        expect(mocks.runContinuous.mock.calls[0]?.[0].aborted).toBe(true);
    });

    it('does not fail close when set up failed', async () => {
        mocks.setUp.mockRejectedValue(new Error('login failed'));
        const sync = createVaultSync();
        const settingUp = sync.setUp();

        await expect(settingUp).rejects.toThrow('login failed');
        await expect(sync.close()).resolves.toBeUndefined();
    });

    it('does not start continuous sync after close', async () => {
        const sync = createVaultSync();

        await sync.close();
        await sync.runContinuous();

        expect(mocks.runContinuous).not.toHaveBeenCalled();
    });
});
