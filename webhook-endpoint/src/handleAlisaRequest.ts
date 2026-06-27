import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { getRandomValueFromArray } from "./getRandomValueFromArray";
import { logger } from "./logger";
import { processAlisaCommand } from "./processAlisaCommand";

const TRICKY_DAD_DEBUG_CHAT_ID = -5242876030;
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

        processAlisaCommand(command)
            .then((result) =>
                sendTelegramMessage({
                    token: TG_TOKEN_SENAEV_COM_BOT,
                    chatId: String(TRICKY_DAD_DEBUG_CHAT_ID),
                    parseMode: "MarkdownV2",
                    text: escapeTelegramMarkdownV2(
                        [
                            `Command: ${command}`,
                            `Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
                            `Destination: ${result.destination}`,
                            `OpenRouter time: ${result.openRouterResponseTime}`,
                            `Supabase time: ${result.supabaseResponseTime}`,
                            result.openRouterError &&
                                `OpenRouter Error: ${String(result.openRouterError)}`,
                            result.supabaseErrorString &&
                                `Supabase Error: ${String(result.supabaseErrorString)}`,
                            result.addedItems && `Added items:\n${result.addedItems.join("\n")}`,
                            result.addedTask && `Added task: ${result.addedTask}`,
                        ]
                            .filter(Boolean)
                            .join("\n"),
                    ),
                }),
            )
            .catch((err) => {
                logger.error(err, "❌ Failed to process Alisa command");

                sendTelegramMessage({
                    token: TG_TOKEN_SENAEV_COM_BOT,
                    chatId: String(TRICKY_DAD_DEBUG_CHAT_ID),
                    parseMode: "MarkdownV2",
                    text: escapeTelegramMarkdownV2(
                        `❌ Failed to process Alisa command=[${command}]: ${err instanceof Error ? err.message : String(err)}`,
                    ),
                }).catch((err) => {
                    logger.error(err, "❌ Failed to send error message to Telegram");
                });
            });

        const responseText = getRandomValueFromArray([
            "Папа сказал что сделает",
            "Папа побежал записывать",
            "Опять? Ну ладно, записал",
            "Эх, опять расходы",
            "Папа постарается",
            "Папа вроде бы запомнил и постарается записать",
            "О, новая работёнка для Папы",
            "Чуть что сразу папа, ну ладно, записал",
            "Не папкай мне тут, но я записал",
            "Хорошо",
            "Будет сделано",
            "Папа уже записывает",
            "Постараюсь не забыть, записал",
            "Папа внёс это в великий список закупок",
            "Записал, никуда не денешься",
            "Папа принял заказ",
            "Добавил в список, машина запущена",
            "Папа зафиксировал потребности семьи",
            "Есть, записал в закупочный реестр",
            "Папа услышал и занёс",
            "Список пополнился, папа сработал",
            "Принято, папа записал",
            "Папа уже добавил это в список",
            "Занёс, потом не говорите что забыли",
            "Записал, отдел снабжения в курсе",
            "Папа оформил заявку",
            "Добавлено, семейная логистика работает",
            "Есть контакт, папа записал",
            "Папа внёс в перечень нужного",
            "Записал, теперь это официально",
            "Добавил в список, процесс пошёл",
            "Папа поставил на учёт",
            "Уже в списке, папа не дремлет",
            "Записал, всё под контролем",
            "Папа добавил это в важное",
            "Сделано, список стал ещё серьезнее",
            "Принял, записал, отступать некуда",
            "Папа всё внёс, можно жить дальше",
            "Добавлено, закупочная операция началась",
            "Папа отметил, что без этого никак",
            "Записал, семейный штаб работает",
            "Есть, папа добавил в список хотелок",
            "Папа взял в обработку и записал",
            "Занёс в список, папа на посту",
            "Принято к закупке",
            "Папа внёс поправки в продовольственный план",
            "Список обновлён, папа красавчик",
            "Добавил, миссия принята",
            "Папа записал, всё по форме",
            "Есть такое, уже в списке",
            "Папа пополнил запасы будущего",
            "Записал, потом сам себе спасибо скажешь",
            "Внесено в список, семья спасена",
        ]);

        logger.info({ responseText }, "👉 Sending fallback response for Alisa command");

        return responseText;
    } catch (err) {
        logger.error(err, "❌ Failed to process Alisa command");

        sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: String(TRICKY_DAD_DEBUG_CHAT_ID),
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
