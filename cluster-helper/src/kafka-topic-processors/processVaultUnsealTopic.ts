import { TG_CLUSTER_CHAT_ID } from "../env";
import { sendTelegramMessage } from "../telegram/api";
import { escapeMarkdownV2 } from "../telegram/escapeMarkdownV2";
import { KafkaTopicProcessorArgument } from "./KafkaTopicProcessorArgument";

export async function processVaultUnsealTopic({
    message: { value },
}: KafkaTopicProcessorArgument): Promise<void> {
    if (!value) {
        throw new Error("Consumed message with no value from Vault Unseal topic");
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
