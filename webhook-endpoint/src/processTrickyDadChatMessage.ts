import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { logger } from "./logger";
import { parseTextOrAudioMessageFromTelegram } from "./parseTextOrAudioMessageFromTelegram";
import { processAlisaCommand } from "./processAlisaCommand";

export async function processTrickyDadChatMessage(message: TelegramMessage): Promise<void> {
    const startTime = Date.now();

    const command = await parseTextOrAudioMessageFromTelegram(message);

    if (!command) {
        logger.info("🔕 Ignoring non-text/audio message in tricky dad chat");
        return;
    }

    await setTelegramMessageReaction({
        chatId: TRICKY_DAD_CHAT_ID,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["👀"],
    });

    logger.info({ command }, "👉 Processing tricky dad chat message");

    try {
        const result = await processAlisaCommand(command);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        const responseLines = [
            `🗣️ Command: ${command}`,
            `⏱️ Duration: ${duration}s`,
            `📍 Destination: ${{ grocery: "🛒 grocery", task: "✅ task", fallback: "🔀 fallback" }[result.destination]}`,
            `🤖 OpenRouter time: ${result.openRouterResponseTime}ms`,
            result.supabaseResponseTime !== null &&
                `🗄️ Supabase time: ${result.supabaseResponseTime}ms`,
            result.openRouterError && `❌ OpenRouter Error: ${String(result.openRouterError)}`,
            result.supabaseErrorString && `❌ Supabase Error: ${String(result.supabaseErrorString)}`,
            result.addedItems && `🛒 Added items:\n${result.addedItems.map((item) => `- ${item}`).join("\n")}`,
            result.addedTask && `✅ Added task: ${result.addedTask}`,
        ]
            .filter(Boolean)
            .join("\n");

        logger.info({ result }, "✅ Finished processing tricky dad chat message");

        const reportChatId = result.destination === "grocery" ? TRICKY_DAD_CHAT_ID : OBSIDIAN_TASKS_CHAT_ID;

        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: reportChatId,
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(responseLines),
            ...(reportChatId === TRICKY_DAD_CHAT_ID && { replyToMessageId: message.message_id }),
        });
    } catch (err) {
        logger.error(err, "❌ Failed to process tricky dad chat message");

        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: OBSIDIAN_TASKS_CHAT_ID,
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(
                `❌ Failed to process command=[${command}]: ${err instanceof Error ? err.message : String(err)}`,
            ),
        });
    }
}
