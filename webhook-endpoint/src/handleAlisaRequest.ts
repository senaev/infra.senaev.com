import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { getRandomValueFromArray } from "./getRandomValueFromArray";
import { processAlisaCommand } from "./processAlisaCommand";
import { telegramApiCall } from "./telegram-api";

const TRICKY_DAD_DEBUG_CHAT_ID = -5242876030;
export async function handleAlisaRequest(body: unknown): Promise<string> {
    const startTime = Date.now();

    try {
        if (!body) {
            throw new Error("Missing request body");
        }

        console.log("🆕 Received Alisa command:", body);
        const { request } = body as Record<string, unknown>;
        if (!request) {
            throw new Error("Missing request field in body");
        }

        const { command } = request as Record<string, unknown>;

        if (typeof command !== "string") {
            throw new Error("Missing command field in request");
        }

        let responseType: "full" | "quick" | "not-responded-yet" = "not-responded-yet";
        const responseText = await Promise.race<string>([
            processAlisaCommand(command).then((text) => {
                responseType = "full";
                return text;
            }),
            // There's a time limit from Yandex, so it's better
            // to answer quickly and continue work in the background
            // than to fail the whole request for the client
            new Promise<string>((resolve) => {
                setTimeout(() => {
                    responseType = "quick";
                    resolve("Батя сказал, что сделает");
                }, 2000);
            }),
        ]);

        console.log(`✅ Processed Alisa command, responseText=[${responseText}]`);

        telegramApiCall("sendMessage", {
            chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
            parse_mode: "MarkdownV2",
            text: [
                "*Processed Alisa command*",
                `*Command:* \`${escapeTelegramMarkdownV2(command)}\``,
                `*Response type:* \`${escapeTelegramMarkdownV2(responseType)}\``,
                `*Response text:* ${escapeTelegramMarkdownV2(responseText)}`,
                `*Duration:* \`${escapeTelegramMarkdownV2(`${((Date.now() - startTime) / 1000).toFixed(2)}s`)}\``,
            ].join("\n"),
        }).catch((err) => {
            console.error("❌ Failed to send success message to Telegram:", err);
        });

        return responseText;
    } catch (err) {
        console.error("❌ Failed to process Alisa command:", err);

        telegramApiCall("sendMessage", {
            chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
            text: `❌ Failed to process Alisa command: ${err instanceof Error ? err.message : String(err)}`,
        }).catch((err) => {
            console.error("❌ Failed to send error message to Telegram:", err);
        });

        return getRandomValueFromArray([
            "Ой-ой, похоже Хитрый Батя всех перехитрил и сломался",
            "У Хитрого Бати что-то пошло не так",
            "Хитрый Батя сказал что очень тебя любит, но сейчас приболел",
            "Ох, похоже, Хитрый Батя заболел",
        ]);
    }
}
