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
};

export function handleAlertmanagerWebhookInternal(requestBody: unknown): AlertItem[] {
    console.log("⬇️⬇️⬇️ Processing Alertmanager webhook");
    console.log(requestBody);
    console.log("⬆️⬆️⬆️");

    if (typeof requestBody !== "object" || requestBody === null) {
        throw new Error(`❌ Received Alertmanager webhook with invalid body=[${requestBody}]`);
    }

    const { alerts } = requestBody as Record<string, unknown>;

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

        const escapedAlertJson = escapeHtml(JSON.stringify(alert, null, 2));
        const escapedAlertname = escapeHtml(alertname);
        const escapedJob = escapeHtml(job);
        const escapedPod = escapeHtml(pod);
        const escapedGeneratorUrl = escapeHtml(encodeURI(generatorURL));

        const lines = [
            `${statusEmoji}${severityEmoji} <a href="${escapedGeneratorUrl}">${escapedAlertname}</a>`,
            `<b>Time:</b> ${escapeHtml(`${formatDate(startsAt)} - ${formatDate(endsAt)}`)}`,
            `<b>Job:</b> <code>${escapedJob}</code>`,
            `<b>Pod:</b> <code>${escapedPod}</code>`,
            `<blockquote expandable>${escapedAlertJson}</blockquote>`,
        ];

        items.push({ message: lines.join("\n") });
    }

    return items;
}

export async function handleAlertmanagerWebhook(requestBody: unknown): Promise<void> {
    try {
        const items = handleAlertmanagerWebhookInternal(requestBody);
        const requestBodyJson = JSON.stringify(requestBody, null, 2);

        for (const { message } of items) {
            console.log("👉 Sending alert to Telegram");
            await sendTelegramMessage({
                chatId: TG_CLUSTER_CHAT_ID,
                text: message,
                parseMode: "HTML",
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
