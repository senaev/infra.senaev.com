import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_CLUSTER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { logger } from "./logger";

export async function processClusterChatMessage(message: TelegramMessage): Promise<void> {
    const { text } = message;

    if (!text) {
        throw new Error("❌ Received Telegram message with no text content in cluster chat");
    }

    logger.info(
        { messageId: message.message_id, userId: message.from?.id },
        "🆕 Received Telegram message in cluster chat",
    );
    await setTelegramMessageReaction({
        chatId: TG_CLUSTER_CHAT_ID,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["🤷"],
    });
    logger.info("✅ Processed Telegram message");
}
