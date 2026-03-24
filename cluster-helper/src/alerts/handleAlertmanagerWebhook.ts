import { TG_CLUSTER_CHAT_ID } from "../env";
import { sendTelegramMessage } from "../telegram/api";
import { escapeHtml } from "../utils/escapeHtml";

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");

    return `${day}-${month}-${year} ${hours}:${minutes}`;
}

const ALERT_STATUSES = {
    firing: "🔴",
    resolved: "🟢",
} as const;

const ALERT_SEVERITIES = {
    info: "ℹ️",
    warning: "⚠️",
    critical: "🚨",
} as const;

type AlertItem = {
    message: string;
    alertJson: unknown;
};

export function handleAlertmanagerWebhookInternal(requestBody: unknown): AlertItem[] {
    console.log("⬇️⬇️⬇️ Processing Alertmanager webhook");
    console.log(requestBody);
    console.log("⬆️⬆️⬆️");

    if (typeof requestBody !== "object" || requestBody === null) {
        throw new Error(`❌ Received Alertmanager webhook with invalid body=[${requestBody}]`);
    }

    const {
        receiver,
        alerts,
        groupLabels,
        commonLabels,
        commonAnnotations,
        externalURL,
        groupKey,
    } = requestBody as Record<string, unknown>;

    if (!Array.isArray(alerts)) {
        throw new Error(`❌ Received Alertmanager webhook with invalid alerts=[${alerts}]`);
    }

    if (alerts.length === 0) {
        throw new Error("❌ Received Alertmanager webhook with no alerts");
    }

    const items: AlertItem[] = [];

    for (const alert of alerts) {
        console.log("⬇️⬇️⬇️ Processing alert");
        console.log(alert);
        console.log("⬆️⬆️⬆️");

        const { status, startsAt, endsAt, labels, annotations, generatorURL } = alert;

        if (typeof annotations !== "object" || annotations === null) {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alert annotations=[${annotations}]`,
            );
        }

        const statusEmoji = ALERT_STATUSES[status as keyof typeof ALERT_STATUSES];
        if (!statusEmoji) {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alert status=[${status}]`,
            );
        }

        if (typeof startsAt !== "string" || typeof endsAt !== "string") {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alert startsAt=[${startsAt}] or endsAt=[${endsAt}]`,
            );
        }

        if (typeof generatorURL !== "string") {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alert generatorURL=[${generatorURL}]`,
            );
        }

        if (typeof labels !== "object" || labels === null) {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alert labels=[${labels}]`,
            );
        }

        const { severity, alertname, alertgroup, instance, job, pod } = labels;

        if (typeof alertname !== "string") {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alertname label=[${alertname}]`,
            );
        }

        if (typeof alertgroup !== "string") {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alertgroup label=[${alertgroup}]`,
            );
        }

        if (typeof instance !== "string") {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid instance label=[${instance}]`,
            );
        }

        if (typeof job !== "string") {
            throw new Error(`❌ Received Alertmanager webhook with invalid job label=[${job}]`);
        }

        if (typeof pod !== "string") {
            throw new Error(`❌ Received Alertmanager webhook with invalid pod label=[${pod}]`);
        }

        const severityEmoji = ALERT_SEVERITIES[severity as keyof typeof ALERT_SEVERITIES];

        const lines = [
            `${statusEmoji}${severityEmoji} <b>${escapeHtml(alertname)}</b> <a href="${escapeHtml(generatorURL)}">🔗</a>`,
            `${formatDate(startsAt)} - ${formatDate(endsAt)}`,

            `Group: <a href="https://vmalert.senaev.com/vmalert/groups?search=${escapeHtml(alertgroup)}">${escapeHtml(alertgroup)}</a>`,
            `Job: ${job}`,
            `Pod: ${pod}`,
            `<a href="${escapeHtml(generatorURL)}">alertmanager</a>`,
        ].filter((line): line is string => line !== undefined);

        items.push({
            message: lines.join("\n"),
            alertJson: alert,
        });
    }
    return items;
}

export async function handleAlertmanagerWebhook(requestBody: unknown): Promise<void> {
    try {
        const messages = handleAlertmanagerWebhookInternal(requestBody);
        for (const { message, alertJson } of messages) {
            console.log("👉 Sending alert to Telegram");
            await sendTelegramMessage({
                text: message,
                chatId: TG_CLUSTER_CHAT_ID,
                parseMode: "HTML",
                replyMarkup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Copy JSON",
                                copy_text: {
                                    text: JSON.stringify(alertJson, null, 2),
                                },
                            },
                        ],
                    ],
                },
            });
            console.log("✅ Alert sent to Telegram");
        }
    } catch (err) {
        console.error("❌ Error handling Alertmanager webhook", err);

        console.log("👉 Sending error to Telegram");
        await sendTelegramMessage({
            text: `❌ Error handling Alertmanager webhook:\n${err instanceof Error ? err.message : String(err)}\n\nReceived body:\n${JSON.stringify(requestBody)}`,
            chatId: TG_CLUSTER_CHAT_ID,
        });
        console.log("✅ Error sent to Telegram");
    }
}
