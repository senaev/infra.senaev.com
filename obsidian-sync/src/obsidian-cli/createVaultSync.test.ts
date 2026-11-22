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

    it('aborts the running continuous sync on close', async () => {
        mocks.runContinuous.mockImplementation(stopOnAbort);
        const sync = createVaultSync();
        const running = sync.runContinuous();

        sync.close();
        await running;

        expect(mocks.runContinuous.mock.calls[0]?.[0].aborted).toBe(true);
    });

    it('aborts the running set up on close', async () => {
        mocks.setUp.mockImplementation(stopOnAbort);
        const sync = createVaultSync();
        const settingUp = sync.setUp();

        sync.close();
        await settingUp;

        expect(mocks.setUp.mock.calls[0]?.[0].aborted).toBe(true);
    });

    it('does not start continuous sync after close', async () => {
        const sync = createVaultSync();

        sync.close();
        await sync.runContinuous();

        expect(mocks.runContinuous).not.toHaveBeenCalled();
    });
});
