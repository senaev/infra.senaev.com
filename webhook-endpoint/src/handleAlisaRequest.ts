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
                        result.openRouterError &&
                            `OpenRouter Error: ${escapeTelegramMarkdownV2(String(result.openRouterError))}`,
                        result.supabaseErrorString &&
                            `Supabase Error: ${escapeTelegramMarkdownV2(String(result.supabaseErrorString))}`,
                        result.addedItems &&
                            `Added items:\n${result.addedItems.map((item) => `${escapeTelegramMarkdownV2(`· ${item}`)}`).join("\n")}`,
                    ]
                        .filter(Boolean)
                        .join("\n"),
                }),
            )
            .catch((err) => {
                console.error("❌ Failed to process Alisa command:", err);

                telegramApiCall("sendMessage", {
                    chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
                    parse_mode: "MarkdownV2",
                    text: escapeTelegramMarkdownV2(
                        `❌ Failed to process Alisa command=[${command}]: ${err instanceof Error ? err.message : String(err)}`,
                    ),
                }).catch((err) => {
                    console.error("❌ Failed to send error message to Telegram:", err);
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

        console.log(
            `✅ Sending fallback response for Alisa command, responseText=[${responseText}]`,
        );

        return responseText;
    } catch (err) {
        console.error("❌ Failed to process Alisa command:", err);

        telegramApiCall("sendMessage", {
            chat_id: TRICKY_DAD_DEBUG_CHAT_ID,
            parse_mode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(
                `❌ Sync error processing Alisa command: ${err instanceof Error ? err.message : String(err)}`,
            ),
        }).catch((err) => {
            console.error("❌ Failed to send error message to Telegram:", err);
        });

        return getRandomValueFromArray([
            "Ой-ой, похоже Папа всех перехитрил и сломался",
            "У Папы что-то пошло не так",
            "Папа сказал что очень тебя любит, но сейчас приболел",
            "Ох, похоже, Папа заболел",
        ]);
    }
}
