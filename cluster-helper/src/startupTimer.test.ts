import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { logger } from './logger';
import { logStartupStep } from './startupTimer';

vi.mock('./logger', () => {
    return { logger: { info: vi.fn() } };
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('logStartupStep', () => {
    it('logs the time of each step and the time since the process started', () => {
        vi.spyOn(performance, 'now')
            .mockReturnValueOnce(1500.4)
            .mockReturnValueOnce(1750.6);

        logStartupStep('modules loaded');
        logStartupStep('bot info fetched');

        expect(vi.mocked(logger.info).mock.calls).toEqual([
            [
                expect.objectContaining({
                    step: 'modules loaded',
                    stepMs: 1500,
                    sinceProcessStartMs: 1500,
                }),
                '⏱️ Startup step',
            ],
            [
                expect.objectContaining({
                    step: 'bot info fetched',
                    stepMs: 250,
                    sinceProcessStartMs: 1751,
                }),
                '⏱️ Startup step',
            ],
        ]);
    });
});
