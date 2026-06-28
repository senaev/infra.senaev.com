import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { TRICKY_DAD_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
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

        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: TRICKY_DAD_CHAT_ID,
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(responseLines),
            replyToMessageId: message.message_id,
        });
    } catch (err) {
        logger.error(err, "❌ Failed to process tricky dad chat message");

        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: TRICKY_DAD_CHAT_ID,
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(
                `❌ Failed to process command=[${command}]: ${err instanceof Error ? err.message : String(err)}`,
            ),
            replyToMessageId: message.message_id,
        });
    }
}
