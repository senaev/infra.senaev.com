import { TG_CLUSTER_CHAT_ID } from "../env";
import { sendTelegramMessage } from "../telegram/api";

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

export function handleAlertmanagerWebhookInternal(requestBody: unknown): string[] {
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

    const messages: string[] = [];

    for (const alert of alerts) {
        console.log("⬇️⬇️⬇️ Processing alert");
        console.log(alert);
        console.log("⬆️⬆️⬆️");

        const { status, startsAt, endsAt, labels, annotations } = alert;

        if (typeof labels !== "object" || labels === null) {
            throw new Error(
                `❌ Received Alertmanager webhook with invalid alert labels=[${labels}]`,
            );
        }

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

        const severityEmoji = ALERT_SEVERITIES[labels.severity as keyof typeof ALERT_SEVERITIES];

        const lines = [
            `${statusEmoji}${severityEmoji}`,
            `${formatDate(startsAt)} - ${formatDate(endsAt)}`,

            `Name: ${labels.alertname ?? "unknown"}`,
            labels.instance ? `Instance: ${labels.instance}` : undefined,
            labels.mountpoint ? `Mountpoint: ${labels.mountpoint}` : undefined,
            labels.device ? `Device: ${labels.device}` : undefined,
            labels.fstype ? `Filesystem: ${labels.fstype}` : undefined,
            labels.namespace ? `Namespace: ${labels.namespace}` : undefined,
            labels.pod ? `Pod: ${labels.pod}` : undefined,
            labels.job ? `Job: ${labels.job}` : undefined,
            "",
            `Summary: ${annotations.summary ?? "No summary"}`,
            annotations.description ? `Description: ${annotations.description}` : undefined,
            alert.generatorURL ? `Source: ${alert.generatorURL}` : undefined,
            externalURL ? `Alertmanager: ${externalURL}` : undefined,
        ].filter((line): line is string => line !== undefined);

        messages.push(lines.join(" "));
    }
    return messages;
}

export async function handleAlertmanagerWebhook(requestBody: unknown): Promise<void> {
    try {
        const messages = handleAlertmanagerWebhookInternal(requestBody);
        for (const message of messages) {
            console.log("👉 Sending alert to Telegram");
            await sendTelegramMessage({
                text: message,
                chatId: TG_CLUSTER_CHAT_ID,
            });
            console.log("✅ Alert sent to Telegram");
        }
    } catch (err) {
        console.error("❌ Error handling Alertmanager webhook", err);

        console.log("👉 Sending error to Telegram");
        await sendTelegramMessage({
            text: `❌ Error handling Alertmanager webhook:\n${err instanceof Error ? err.message : String(err)}`,
            chatId: TG_CLUSTER_CHAT_ID,
            parseMode: "HTML",
        });
        console.log("✅ Error sent to Telegram");
    }
}
