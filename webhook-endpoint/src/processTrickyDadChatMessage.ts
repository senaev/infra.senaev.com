import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { logger } from "./logger";
import { parseTextOrAudioMessageFromTelegram } from "./parseTextOrAudioMessageFromTelegram";
import { processAlisaCommand } from "./processAlisaCommand";
import { sendTrickyDadErrorReport, sendTrickyDadReport, TrickyDadReportSource } from "./sendTrickyDadReport";

export type TrickyDadMessageSource = TrickyDadReportSource;

export async function processTrickyDadChatMessage(
    message: TelegramMessage,
    source: TrickyDadMessageSource,
): Promise<void> {
    const startTime = Date.now();

    const command = await parseTextOrAudioMessageFromTelegram(message);

    if (!command) {
        logger.info("🔕 Ignoring non-text/audio message in tricky dad chat");
        return;
    }

    const sourceChatId = source === "Tricky Dad" ? TRICKY_DAD_CHAT_ID : OBSIDIAN_TASKS_CHAT_ID;

    await setTelegramMessageReaction({
        chatId: sourceChatId,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["👀"],
    });

    logger.info({ command, source }, "👉 Processing tricky dad chat message");

    try {
        const result = await processAlisaCommand(command);
        const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.info({ result }, "✅ Finished processing tricky dad chat message");

        await sendTrickyDadReport({
            command,
            source,
            durationSeconds,
            result,
            replyToMessageId: message.message_id,
        });
    } catch (err) {
        logger.error(err, "❌ Failed to process tricky dad chat message");
        await sendTrickyDadErrorReport({ command, err });
    }
}
