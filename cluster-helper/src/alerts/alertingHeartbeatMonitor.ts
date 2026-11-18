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
    let isDownReported = false;
    let isReportingDown = false;
    let checkTimer: NodeJS.Timeout | undefined;

    async function check(): Promise<void> {
        const silentSince = lastHeartbeatAt ?? startedAt;

        if (isDownReported || isReportingDown || now() - silentSince < timeoutMs) {
            return;
        }

        isReportingDown = true;

        const since = lastHeartbeatAt === null
            ? `no heartbeat since cluster-helper started at ${formatTime(startedAt)}`
            : `the last heartbeat was at ${formatTime(lastHeartbeatAt)}`;

        try {
            await notify([
                `🚨 ${telegramBold('Alerting is down')}`,
                escapeTelegramMarkdown(`No heartbeat from Alertmanager for ${formatDurationMinutes(now() - silentSince)}: ${since}.`),
                escapeTelegramMarkdown('Alerts are not evaluated or delivered. Check senaev-madrid and the telemetry pods: vmagent, VMSingle, vmalert, Alertmanager.'),
            ].join(LINE_BREAK));
            // Only after a successful send: if Telegram failed, the next check tries again.
            isDownReported = true;
            logger.warn({ lastHeartbeatAt }, '🚨 Alerting heartbeat lost, reported to Telegram');
        } catch (error) {
            logger.error(error, '❌ Failed to report the lost alerting heartbeat');
        } finally {
            isReportingDown = false;
        }
    }

    async function recordHeartbeat(): Promise<void> {
        const silentSince = lastHeartbeatAt ?? startedAt;
        const wasDownReported = isDownReported;

        lastHeartbeatAt = now();
        isDownReported = false;

        if (!wasDownReported) {
            return;
        }

        logger.info('✅ Alerting heartbeat is back');

        try {
            await notify([
                `✅ ${telegramBold('Alerting recovered')}`,
                escapeTelegramMarkdown(`Heartbeats are back after ${formatDurationMinutes(lastHeartbeatAt - silentSince)} without them.`),
            ].join(LINE_BREAK));
        } catch (error) {
            logger.error(error, '❌ Failed to report the recovered alerting heartbeat');
        }
    }

    function start(): void {
        if (checkTimer !== undefined) {
            return;
        }

        checkTimer = setInterval(() => {
            void check();
        }, checkIntervalMs);
        logger.info({ checkIntervalMs }, '✅ Alerting heartbeat monitor started');
    }

    function stop(): void {
        clearInterval(checkTimer);
        checkTimer = undefined;
    }

    return {
        recordHeartbeat,
        check,
        start,
        stop,
    };
}
