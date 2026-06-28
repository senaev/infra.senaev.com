import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TG_TOKEN_SENAEV_COM_BOT, OBSIDIAN_TASKS_CHAT_ID } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { getRandomValueFromArray } from "./getRandomValueFromArray";
import { logger } from "./logger";
import { processAlisaCommand } from "./processAlisaCommand";
import { sendTrickyDadErrorReport, sendTrickyDadReport } from "./sendTrickyDadReport";
import { TRICKY_DAD_FUNNY_RESPONSES } from "./TRICKY_DAD_FUNNY_RESPONSES";

export async function handleAlisaRequest(body: unknown): Promise<string> {
    const startTime = Date.now();

    try {
        if (!body) {
            throw new Error("Missing request body");
        }

        logger.info({ body }, "🆕 Received Alisa command");
        const { request } = body as Record<string, unknown>;
        if (!request) {
            throw new Error("Missing request field in body");
        }

        const { command } = request as Record<string, unknown>;

        if (typeof command !== "string") {
            throw new Error("Missing command field in request");
        }

        processAlisaCommand(command, "Alisa")
            .then((result) =>
                sendTrickyDadReport({
                    command,
                    source: "Alisa",
                    durationSeconds: ((Date.now() - startTime) / 1000).toFixed(2),
                    result,
                }),
            )
            .catch((err) => {
                logger.error(err, "❌ Failed to process Alisa command");
                sendTrickyDadErrorReport({ command, err }).catch((err) => {
                    logger.error(err, "❌ Failed to send error message to Telegram");
                });
            });

        const responseText = getRandomValueFromArray(TRICKY_DAD_FUNNY_RESPONSES);

        logger.info({ responseText }, "👉 Sending fallback response for Alisa command");

        return responseText;
    } catch (err) {
        logger.error(err, "❌ Failed to process Alisa command");

        sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: String(OBSIDIAN_TASKS_CHAT_ID),
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(
                `❌ Sync error processing Alisa command: ${err instanceof Error ? err.message : String(err)}`,
            ),
        }).catch((err) => {
            logger.error(err, "❌ Failed to send error message to Telegram");
        });
        return getRandomValueFromArray([
            "Ой-ой, похоже Папа всех перехитрил и сломался",
            "У Папы что-то пошло не так",
            "Папа сказал что очень тебя любит, но сейчас приболел",
            "Ох, похоже, Папа заболел",
        ]);
    }
}
