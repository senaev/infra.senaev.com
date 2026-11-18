import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import {
    ALERTING_HEARTBEAT_CHECK_INTERVAL_MS,
    ALERTING_HEARTBEAT_TIMEOUT_MS,
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

function setup() {
    let time = START;
    const notify = vi.fn<(markdown: string) => Promise<void>>(async () => {});
    const monitor = createAlertingHeartbeatMonitor({
        notify,
        now: () => time,
    });

    return {
        monitor,
        notify,
        advance: (ms: number) => {
            time += ms;
        },
    };
}

describe('createAlertingHeartbeatMonitor', () => {
    it('stays quiet while heartbeats arrive', async () => {
        const {
            monitor, notify, advance,
        } = setup();

        for (let i = 0; i < 10; i++) {
            advance(MINUTE);
            await monitor.recordHeartbeat();
            await monitor.check();
        }

        expect(notify).not.toHaveBeenCalled();
    });

    it('waits a full timeout after the start before judging', async () => {
        const {
            monitor, notify, advance,
        } = setup();

        advance(ALERTING_HEARTBEAT_TIMEOUT_MS - 1);
        await monitor.check();
        expect(notify).not.toHaveBeenCalled();

        advance(1);
        await monitor.check();
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0]?.[0]).toContain('no heartbeat since cluster\\-helper started at 18\\-11\\-2026 18:00 UTC');
    });

    it('reports a lost heartbeat once, then the recovery once', async () => {
        const {
            monitor, notify, advance,
        } = setup();

        advance(MINUTE);
        await monitor.recordHeartbeat();

        advance(ALERTING_HEARTBEAT_TIMEOUT_MS);
        await monitor.check();
        advance(MINUTE);
        await monitor.check();

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0]?.[0]).toContain('**Alerting is down**');
        expect(notify.mock.calls[0]?.[0]).toContain('the last heartbeat was at 18\\-11\\-2026 18:01 UTC');

        await monitor.recordHeartbeat();
        await monitor.recordHeartbeat();

        expect(notify).toHaveBeenCalledTimes(2);
        expect(notify.mock.calls[1]?.[0]).toContain('**Alerting recovered**');
        expect(notify.mock.calls[1]?.[0]).toContain('after 6 min without them');
    });

    it('retries the report when Telegram fails', async () => {
        const {
            monitor, notify, advance,
        } = setup();

        notify.mockRejectedValueOnce(new Error('Telegram is down'));
        advance(ALERTING_HEARTBEAT_TIMEOUT_MS);
        await monitor.check();
        await monitor.check();

        expect(notify).toHaveBeenCalledTimes(2);
    });

    it('does not send two reports when checks overlap', async () => {
        const {
            monitor, notify, advance,
        } = setup();
        let finishSend = () => {};

        notify.mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishSend = resolve;
        }));
        advance(ALERTING_HEARTBEAT_TIMEOUT_MS);

        const firstCheck = monitor.check();

        await monitor.check();
        finishSend();
        await firstCheck;
        await monitor.check();

        expect(notify).toHaveBeenCalledTimes(1);
    });
});

describe('state changes during a send', () => {
    it('reports the recovery when a heartbeat arrives while the outage report is being sent', async () => {
        const {
            monitor, notify, advance,
        } = setup();
        let finishSend = () => {};

        notify.mockImplementationOnce(() => new Promise<void>((resolve) => {
            finishSend = resolve;
        }));
        advance(ALERTING_HEARTBEAT_TIMEOUT_MS);

        const pendingCheck = monitor.check();

        advance(MINUTE);
        await monitor.recordHeartbeat();
        finishSend();
        await pendingCheck;

        expect(notify).toHaveBeenCalledTimes(2);
        expect(notify.mock.calls[1]?.[0]).toContain('**Alerting recovered**');
    });

    it('retries a failed recovery report until it is sent, then only once', async () => {
        const {
            monitor, notify, advance,
        } = setup();

        advance(ALERTING_HEARTBEAT_TIMEOUT_MS);
        await monitor.check();
        notify.mockRejectedValueOnce(new Error('Telegram is down'));
        await monitor.recordHeartbeat();
        expect(notify).toHaveBeenCalledTimes(2);

        await monitor.check();
        await monitor.check();
        await monitor.recordHeartbeat();

        expect(notify).toHaveBeenCalledTimes(3);
        expect(notify.mock.calls[2]?.[0]).toContain('**Alerting recovered**');
    });
});

describe('start and stop', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('checks on its own interval until stopped', async () => {
        vi.useFakeTimers({ now: START });
        const notify = vi.fn<(markdown: string) => Promise<void>>(async () => {});
        const monitor = createAlertingHeartbeatMonitor({ notify });

        monitor.start();
        monitor.start();
        await vi.advanceTimersByTimeAsync(ALERTING_HEARTBEAT_TIMEOUT_MS + ALERTING_HEARTBEAT_CHECK_INTERVAL_MS);
        expect(notify).toHaveBeenCalledTimes(1);

        monitor.stop();
        await monitor.recordHeartbeat();
        notify.mockClear();
        await vi.advanceTimersByTimeAsync(2 * ALERTING_HEARTBEAT_TIMEOUT_MS);
        expect(notify).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
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
