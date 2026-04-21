import { escapeTelegramMarkdownV2 } from "senaev-utils/src/utils/TelegramApi/escapeTelegramMarkdownV2/escapeTelegramMarkdownV2";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TG_CLUSTER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "../env";
import { KafkaTopicProcessorArgument } from "./KafkaTopicProcessorArgument";

type QbittorrentWebuiPasswordMessage = {
    password: string;
    podName: string;
};

function isQbittorrentWebuiPasswordMessage(
    value: unknown,
): value is QbittorrentWebuiPasswordMessage {
    return (
        typeof value === "object" &&
        value !== null &&
        "password" in value &&
        "podName" in value &&
        typeof value.password === "string" &&
        typeof value.podName === "string"
    );
}

export async function processQbittorrentWebuiPasswordTopic({
    message: { value },
}: KafkaTopicProcessorArgument): Promise<void> {
    if (!value) {
        throw new Error("Consumed message with no value from qBittorrent WebUI password topic");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(value.toString());
    } catch (error) {
        throw new Error("Failed to parse qBittorrent WebUI password message", {
            cause: error,
        });
    }

    if (!isQbittorrentWebuiPasswordMessage(parsed)) {
        throw new Error("Invalid qBittorrent WebUI password message payload");
    }

    await sendTelegramMessage({
        text: `qBittorrent WebUI password for ${escapeTelegramMarkdownV2(parsed.podName)}:\n||${escapeTelegramMarkdownV2(parsed.password)}||`,
        chatId: TG_CLUSTER_CHAT_ID,
        parseMode: "MarkdownV2",
        token: TG_TOKEN_SENAEV_COM_BOT,
        replyMarkup: {
            inline_keyboard: [[{ text: "Copy", copy_text: { text: parsed.password } }]],
        },
    });
    console.log("✅ qBittorrent WebUI password sent to Telegram Cluster Chat");
}
