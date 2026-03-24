import { TG_CLUSTER_CHAT_ID } from "../env";
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
    await setMessageReaction(TG_CLUSTER_CHAT_ID, message.message_id, ["🤷"]);
    console.log("✅ Processed Telegram message");
}
