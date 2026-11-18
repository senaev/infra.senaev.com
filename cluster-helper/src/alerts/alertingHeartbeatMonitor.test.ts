import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import {
    ALERTING_HEARTBEAT_CHECK_INTERVAL_MS,
    ALERTING_HEARTBEAT_TIMEOUT_MS,
    type AlertingHeartbeatMonitor,
    createAlertingHeartbeatMonitor,
    formatDurationMinutes,
} from './alertingHeartbeatMonitor';

vi.mock('../logger', () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

const START = Date.UTC(2026, 10, 18, 18, 0);
const MINUTE = 60_000;

let monitor: AlertingHeartbeatMonitor;
let notify: ReturnType<typeof vi.fn<(markdown: string) => Promise<void>>>;

/** Moves the fake clock and runs the checks that fall due, with their sends. */
async function advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
}

function getMessage(index: number): string {
    return notify.mock.calls[index]?.[0] ?? '';
}

beforeEach(() => {
    vi.useFakeTimers({ now: START });
    notify = vi.fn(async () => {});
    monitor = createAlertingHeartbeatMonitor({ notify });
    monitor.start();
});

afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
});

describe('createAlertingHeartbeatMonitor', () => {
    it('stays quiet while heartbeats arrive', async () => {
        for (let i = 0; i < 10; i++) {
            await advance(MINUTE);
            await monitor.recordHeartbeat();
        }

        expect(notify).not.toHaveBeenCalled();
    });

    it('waits a full timeout after the start before judging', async () => {
        await advance(ALERTING_HEARTBEAT_TIMEOUT_MS - 1);
        expect(notify).not.toHaveBeenCalled();

        await advance(1);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(getMessage(0)).toContain('no heartbeat since cluster\\-helper started at 18\\-11\\-2026 18:00 UTC');
    });

    it('reports a lost heartbeat once, then the recovery once', async () => {
        await advance(MINUTE);
        await monitor.recordHeartbeat();

        await advance(ALERTING_HEARTBEAT_TIMEOUT_MS + MINUTE);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(getMessage(0)).toContain('**Alerting is down**');
        expect(getMessage(0)).toContain('the last heartbeat was at 18\\-11\\-2026 18:01 UTC');

        await monitor.recordHeartbeat();
        await monitor.recordHeartbeat();
        expect(notify).toHaveBeenCalledTimes(2);
        expect(getMessage(1)).toContain('**Alerting recovered**');
        expect(getMessage(1)).toContain('after 6 min without them');
    });

    it('retries the report on the next check when Telegram fails', async () => {
        notify.mockRejectedValueOnce(new Error('Telegram is down'));

        await advance(ALERTING_HEARTBEAT_TIMEOUT_MS);
        expect(notify).toHaveBeenCalledTimes(1);

        await advance(ALERTING_HEARTBEAT_CHECK_INTERVAL_MS);
        expect(notify).toHaveBeenCalledTimes(2);

        await advance(5 * ALERTING_HEARTBEAT_CHECK_INTERVAL_MS);
        expect(notify).toHaveBeenCalledTimes(2);
    });

    it('does not send twice when checks come while a report is being sent', async () => {
        let finishSend = () => {};

        notify.mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishSend = resolve;
        }));

        await advance(ALERTING_HEARTBEAT_TIMEOUT_MS + 3 * ALERTING_HEARTBEAT_CHECK_INTERVAL_MS);
        finishSend();
        await advance(3 * ALERTING_HEARTBEAT_CHECK_INTERVAL_MS);

        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('reports the recovery when a heartbeat arrives while the outage report is being sent', async () => {
        let finishSend = () => {};

        notify.mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishSend = resolve;
        }));

        await advance(ALERTING_HEARTBEAT_TIMEOUT_MS);
        await monitor.recordHeartbeat();
        finishSend();
        await advance(0);

        expect(notify).toHaveBeenCalledTimes(2);
        expect(getMessage(1)).toContain('**Alerting recovered**');
    });

    it('retries a failed recovery report until it is sent, then only once', async () => {
        await advance(ALERTING_HEARTBEAT_TIMEOUT_MS);
        notify.mockRejectedValueOnce(new Error('Telegram is down'));
        await monitor.recordHeartbeat();
        expect(notify).toHaveBeenCalledTimes(2);

        await advance(2 * ALERTING_HEARTBEAT_CHECK_INTERVAL_MS);
        await monitor.recordHeartbeat();

        expect(notify).toHaveBeenCalledTimes(3);
        expect(getMessage(2)).toContain('**Alerting recovered**');
    });

    it('starts one interval and stops it', async () => {
        monitor.start();
        expect(vi.getTimerCount()).toBe(1);

        monitor.stop();
        expect(vi.getTimerCount()).toBe(0);

        await advance(2 * ALERTING_HEARTBEAT_TIMEOUT_MS);
        expect(notify).not.toHaveBeenCalled();
    });
});

describe('formatDurationMinutes', () => {
    it('formats minutes and hours', () => {
        expect(formatDurationMinutes(10_000)).toBe('1 min');
        expect(formatDurationMinutes(5 * MINUTE)).toBe('5 min');
        expect(formatDurationMinutes(60 * MINUTE)).toBe('1 h');
        expect(formatDurationMinutes(83 * MINUTE)).toBe('1 h 23 min');
    });
});
