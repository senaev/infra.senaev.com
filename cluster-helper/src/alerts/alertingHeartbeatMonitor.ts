import { formatUtcDateTime } from 'senaev-utils/src/utils/Date/formatUtcDateTime/formatUtcDateTime';
import { escapeTelegramMarkdown, telegramBold } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';

import { logger } from '../logger';

/**
 * Dead man's switch for the alerting stack. vmagent, VMSingle, vmalert and Alertmanager all run on
 * one node, so when it is down no alert can fire. Alertmanager sends the always-firing
 * `alerting-heartbeat` alert here about once a minute; this monitor, which runs on another node,
 * reports to Telegram when the heartbeats stop and again when they come back.
 */
export const ALERTING_HEARTBEAT_TIMEOUT_MS = 5 * 60_000;
export const ALERTING_HEARTBEAT_CHECK_INTERVAL_MS = 30_000;

const LINE_BREAK = '  \n';

type AlertingHeartbeatMonitorOptions = {
    /** Sends a Telegram Markdown message. A rejected promise means the message was not sent. */
    notify: (markdown: string) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
    checkIntervalMs?: number;
};

export type AlertingHeartbeatMonitor = {
    recordHeartbeat: () => Promise<void>;
    /** One check; {@link AlertingHeartbeatMonitor.start} runs it every `checkIntervalMs`. */
    check: () => Promise<void>;
    start: () => void;
    stop: () => void;
};

function formatTime(timeMs: number): string {
    return `${formatUtcDateTime(new Date(timeMs))} UTC`;
}

export function formatDurationMinutes(durationMs: number): string {
    const totalMinutes = Math.max(1, Math.round(durationMs / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes} min`;
    }

    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function createAlertingHeartbeatMonitor({
    notify,
    now = Date.now,
    timeoutMs = ALERTING_HEARTBEAT_TIMEOUT_MS,
    checkIntervalMs = ALERTING_HEARTBEAT_CHECK_INTERVAL_MS,
}: AlertingHeartbeatMonitorOptions): AlertingHeartbeatMonitor {
    // The start counts as a heartbeat: after a restart, wait a full timeout before judging.
    const startedAt = now();
    let lastHeartbeatAt: number | null = null;
    // What the Telegram chat was last told: an outage that began at `silentSince`, or nothing.
    let reportedOutage: { silentSince: number } | null = null;
    let isSending = false;
    let checkTimer: NodeJS.Timeout | undefined;

    function formatDownMessage(silentSince: number): string {
        const since = lastHeartbeatAt === null
            ? `no heartbeat since cluster-helper started at ${formatTime(startedAt)}`
            : `the last heartbeat was at ${formatTime(lastHeartbeatAt)}`;

        return [
            `🚨 ${telegramBold('Alerting is down')}`,
            escapeTelegramMarkdown(`No heartbeat from Alertmanager for ${formatDurationMinutes(now() - silentSince)}: ${since}.`),
            escapeTelegramMarkdown('Alerts are not evaluated or delivered. Check senaev-madrid and the telemetry pods: vmagent, VMSingle, vmalert, Alertmanager.'),
        ].join(LINE_BREAK);
    }

    function formatRecoveredMessage(silentSince: number, recoveredAt: number): string {
        return [
            `✅ ${telegramBold('Alerting recovered')}`,
            escapeTelegramMarkdown(`Heartbeats are back after ${formatDurationMinutes(recoveredAt - silentSince)} without them.`),
        ].join(LINE_BREAK);
    }

    async function trySend(markdown: string): Promise<boolean> {
        try {
            await notify(markdown);

            return true;
        } catch (error) {
            logger.error(error, '❌ Failed to send the alerting heartbeat status to Telegram, will retry');

            return false;
        }
    }

    /**
     * Brings the chat in line with the heartbeat state. One send at a time; after each send the
     * state is read again, because a heartbeat can arrive or stop meanwhile. A failed send is
     * retried by the next check or heartbeat.
     */
    async function reconcile(): Promise<void> {
        if (isSending) {
            return;
        }

        isSending = true;

        try {
            for (;;) {
                const silentSince = lastHeartbeatAt ?? startedAt;
                const isDown = now() - silentSince >= timeoutMs;

                if (isDown && reportedOutage === null) {
                    if (!await trySend(formatDownMessage(silentSince))) {
                        return;
                    }

                    reportedOutage = { silentSince };
                    logger.warn({ lastHeartbeatAt }, '🚨 Alerting heartbeat lost, reported to Telegram');
                } else if (!isDown && reportedOutage !== null) {
                    if (!await trySend(formatRecoveredMessage(reportedOutage.silentSince, lastHeartbeatAt ?? now()))) {
                        return;
                    }

                    reportedOutage = null;
                    logger.info('✅ Alerting heartbeat is back, reported to Telegram');
                } else {
                    return;
                }
            }
        } finally {
            isSending = false;
        }
    }

    async function recordHeartbeat(): Promise<void> {
        lastHeartbeatAt = now();
        await reconcile();
    }

    function start(): void {
        if (checkTimer !== undefined) {
            return;
        }

        checkTimer = setInterval(() => {
            void reconcile();
        }, checkIntervalMs);
        logger.info({ checkIntervalMs }, '✅ Alerting heartbeat monitor started');
    }

    function stop(): void {
        clearInterval(checkTimer);
        checkTimer = undefined;
    }

    return {
        recordHeartbeat,
        check: reconcile,
        start,
        stop,
    };
}
