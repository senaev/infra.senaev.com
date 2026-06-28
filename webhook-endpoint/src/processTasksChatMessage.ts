import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { OBSIDIAN_TASKS_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { logger } from "./logger";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { parseTaskMessageWithOpenRouter } from "./parseTaskMessageWithOpenRouter";
import { parseTextOrAudioMessageFromTelegram } from "./parseTextOrAudioMessageFromTelegram";
import { insertSupabaseRows } from "./supabase";

export async function processTasksChatMessage(message: TelegramMessage): Promise<void> {
    logger.info(
        { messageId: message.message_id, userId: message.from?.id },
        "🆕 Received Telegram message in tasks chat",
    );

    try {
        const text = await parseTextOrAudioMessageFromTelegram(message);

        if (!text) {
            logger.info(
                { messageId: message.message_id },
                "⏭️ Ignoring non-text/audio message in tasks chat",
            );
            return;
        }

        await setTelegramMessageReaction({
            chatId: OBSIDIAN_TASKS_CHAT_ID,
            messageId: message.message_id,
            token: TG_TOKEN_SENAEV_COM_BOT,
            reactions: ["🧊"],
        });
        logger.info("✅ Added 🧊 reaction to message");

        const parsed = await parseTaskMessageWithOpenRouter(text);
        logger.info(
            { title: parsed.title, due_date: parsed.due_date },
            "✅ Parsed task message with OpenRouter",
        );

        await insertSupabaseRows("tasks", {
            title: parsed.title,
            ...(parsed.due_date !== null && { due_date: parsed.due_date }),
        });
        logger.info("✅ Inserted task into Supabase");

        await setTelegramMessageReaction({
            chatId: OBSIDIAN_TASKS_CHAT_ID,
            messageId: message.message_id,
            token: TG_TOKEN_SENAEV_COM_BOT,
            reactions: ["👀"],
        });
        logger.info("✅ Added 👀 reaction to message");
    } catch (error) {
        logger.error(error, "❌ processTasksChatMessage error");

        logger.info("👉 Sending error message");
        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: OBSIDIAN_TASKS_CHAT_ID,
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(`❌ ${error}`),
            replyToMessageId: message.message_id,
        });
        logger.info("✅ Sent error message");
    }
}
