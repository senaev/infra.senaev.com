import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { getRandomValueFromArray } from "./getRandomValueFromArray";
import { processAlisaCommand } from "./processAlisaCommand";
import { telegramApiCall } from "./telegram-api";

// There's a time limit from Yandex, so it's better
// to answer quickly and continue work in the background
// than to fail the whole request for the client
const ALISA_RESPONSE_TIME_LIMIT = 2000;

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

        let responseType: "full" | "short" | "not-responded-yet" = "not-responded-yet";
        const responseText = await Promise.race<string>([
            processAlisaCommand(command).then((result) => {
                responseType = "full";

                telegramApiCall("sendMessage", {
                    chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
                    parse_mode: "MarkdownV2",
                    text: [
                        `Command: \`${escapeTelegramMarkdownV2(command)}\``,
                        `Type: \`${escapeTelegramMarkdownV2(responseType)}\``,
                        `Text: ${escapeTelegramMarkdownV2(result.responseTextForUser)}`,
                        `OpenRouter time: ${result.openRouterResponseTime}`,
                        `Supabase time: ${result.supabaseResponseTime}`,
                        `Duration: \`${escapeTelegramMarkdownV2(`${((Date.now() - startTime) / 1000).toFixed(2)}s`)}\``,
                    ].join("\n"),
                }).catch((err) => {
                    console.error("❌ Failed to send success message to Telegram:", err);
                });

                return result.responseTextForUser;
            }),
            new Promise<string>((resolve) => {
                setTimeout(() => {
                    responseType = "short";
                    const responseText = getRandomValueFromArray([
                        "Батя сказал что сделает",
                        "Батя убежал записывать",
                        "Опять? Ну ладно, записал",
                        "Эх, опять расходы",
                        "Батя постарается",
                    ]);
                    resolve(responseText);

                    telegramApiCall("sendMessage", {
                        chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
                        parse_mode: "MarkdownV2",
                        text: `⌛️ Time limit=${ALISA_RESPONSE_TIME_LIMIT} reached\nResponse: ${responseText}`,
                    }).catch((err) => {
                        console.error("❌ Failed to send success message to Telegram:", err);
                    });
                }, ALISA_RESPONSE_TIME_LIMIT);
            }),
        ]);

        console.log(`✅ Processed Alisa command, responseText=[${responseText}]`);

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
