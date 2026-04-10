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

        processAlisaCommand(command)
            .then((result) =>
                telegramApiCall("sendMessage", {
                    chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
                    parse_mode: "MarkdownV2",
                    text: [
                        `Command: \`${escapeTelegramMarkdownV2(command)}\``,
                        `Duration: \`${escapeTelegramMarkdownV2(`${((Date.now() - startTime) / 1000).toFixed(2)}s`)}\``,
                        `OpenRouter time: ${result.openRouterResponseTime}`,
                        `Supabase time: ${result.supabaseResponseTime}`,
                        `Error: ${escapeTelegramMarkdownV2(String(result.errorString))}`,
                    ].join("\n"),
                }),
            )
            .catch((err) => {
                console.error("❌ Failed to process Alisa command:", err);

                telegramApiCall("sendMessage", {
                    chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
                    text: `❌ Failed to process Alisa command: ${err instanceof Error ? err.message : String(err)}`,
                }).catch((err) => {
                    console.error("❌ Failed to send error message to Telegram:", err);
                });
            });

        const responseText = getRandomValueFromArray([
            "Батя сказал что сделает",
            "Батя побежал записывать",
            "Опять? Ну ладно, записал",
            "Эх, опять расходы",
            "Батя постарается",
            "Батя вроде бы запомнил и постарается записать",
            "О, новая работёнка для Бати",
            "Чуть что сразу батя, ну ладно, записал",
            "Не батькай мне тут, но я записал",
        ]);

        console.log(
            `✅ Sending fallback response for Alisa command, responseText=[${responseText}]`,
        );

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
