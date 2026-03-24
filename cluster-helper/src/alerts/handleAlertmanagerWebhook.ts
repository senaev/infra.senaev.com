import { TG_CLUSTER_CHAT_ID } from "../env";
import { sendTelegramMessage } from "../telegram/api";

export function handleAlertmanagerWebhookInternal(requestBody: unknown): string[] {
    console.log("⬇️⬇️⬇️ Received Alertmanager webhook");
    console.log(requestBody);
    console.log("⬆️⬆️⬆️");

    if (typeof requestBody !== "object" || requestBody === null) {
        throw new Error(`❌ Received Alertmanager webhook with invalid body=[${requestBody}]`);
    }

    const { alerts, externalURL, receiver, commonLabels, commonAnnotations, groupKey } =
        requestBody as Record<string, unknown>;

    if (!Array.isArray(alerts)) {
        throw new Error(`❌ Received Alertmanager webhook with invalid alerts=[${alerts}]`);
    }

    if (alerts.length === 0) {
        throw new Error("❌ Received Alertmanager webhook with no alerts");
    }

    const messages: string[] = [];

    for (const alert of alerts) {
        const labels = alert.labels ?? {};
        const annotations = alert.annotations ?? {};
        const lines = [
            `${alert.status === "resolved" ? "✅ Resolved" : "🚨 Alert"}`,
            `Name: ${labels.alertname ?? "unknown"}`,
            `Severity: ${labels.severity ?? "unknown"}`,
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

        messages.push(lines.join("\n"));
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
        });
        console.log("✅ Error sent to Telegram");
    }
}
