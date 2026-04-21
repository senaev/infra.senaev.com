import { TG_CLUSTER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "../env";
import { setMessageReaction } from "./api";
import { TelegramMessage } from "./types";

export async function processClusterChatMessage(message: TelegramMessage): Promise<void> {
    const { text } = message;

    if (!text) {
        throw new Error("❌ Received Telegram message with no text content in cluster chat");
    }

    console.log(
        `👉 Received Telegram message with id=[${message.message_id}] in cluster chat from user id=[${message.from?.id}]`,
    );
    await setMessageReaction({
        chatId: TG_CLUSTER_CHAT_ID,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["🤷"],
    });
    console.log("✅ Processed Telegram message");
}
