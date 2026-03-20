import { TG_CLUSTER_CHAT_ID } from "../env";
import { sendTelegramMessage } from "../telegram/api";
import { KafkaTopicProcessorArgument } from "./KafkaTopicProcessorArgument";

function escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export async function processVaultUnsealTopic({
    message: { value },
}: KafkaTopicProcessorArgument): Promise<void> {
    if (!value) {
        console.error("❌ Consumed message with no value from Vault Unseal topic");
        return;
    }

    const token = JSON.parse(value.toString()).root_token;
    await sendTelegramMessage({
        text: `New vault unseal token:\n||${escapeMarkdownV2(token)}||`,
        chatId: TG_CLUSTER_CHAT_ID,
        parseMode: "MarkdownV2",
        replyMarkup: {
            inline_keyboard: [[{ text: "Copy", copy_text: { text: token } }]],
        },
    });
    console.log("✅ Vault unseal token sent to Telegram Cluster Chat");
}
