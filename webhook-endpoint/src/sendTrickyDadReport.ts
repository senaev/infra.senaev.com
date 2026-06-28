import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { logger } from "./logger";
import { HandleTrickyDadRequestResult } from "./processAlisaCommand";
import { TRICKY_DAD_SOURCE_TO_CHAT_ID, TrickyDadSource } from "./TrickyDadSource";

export async function sendTrickyDadReport({
    command,
    source,
    durationSeconds,
    result,
    replyToMessageId,
}: {
    command: string;
    source: TrickyDadSource;
    durationSeconds: string;
    result: HandleTrickyDadRequestResult;
    replyToMessageId?: number;
}): Promise<void> {
    const reportChatId =
        result.destination === "grocery" ? TRICKY_DAD_CHAT_ID : OBSIDIAN_TASKS_CHAT_ID;

    const sourceChatId = TRICKY_DAD_SOURCE_TO_CHAT_ID[source];

    const shouldReply = sourceChatId && reportChatId === sourceChatId;

    const esc = escapeTelegramMarkdownV2;

    const parts: string[] = [];

    if (result.addedItems) {
        parts.push(
            `🛒 Добавлено:\n${result.addedItems.map((item) => `• *${esc(item)}*`).join("\n")}`,
        );
    }

    if (result.addedTask) {
        parts.push(`📌 Новая задача: *${esc(result.addedTask)}*`);
    }

    const detailLines = [
        `🗣️ Команда: ${esc(command)}`,
        `📡 Откуда: ${esc(source)}`,
        `📍 Куда: ${{ grocery: "🛒 grocery", task: "📌 task", fallback: "🔀 fallback" }[result.destination]}`,
        `⏱️ Время: ${esc(durationSeconds)}s`,
        `🤖 Время OpenRouter: ${esc(String(result.openRouterResponseTime))}ms`,
        result.supabaseResponseTime !== null
            ? `🗄️ Время Supabase: ${esc(String(result.supabaseResponseTime))}ms`
            : null,
        result.openRouterError ? `❌ OpenRouter Error: ${esc(String(result.openRouterError))}` : null,
        result.supabaseErrorString
            ? `❌ Supabase Error: ${esc(String(result.supabaseErrorString))}`
            : null,
    ].filter(Boolean) as string[];

    if (detailLines.length > 0) {
        parts.push(`**> ${detailLines.join("\n> ")}||`);
    }

    const text = parts.join("\n");

    logger.info({ reportChatId, source }, "👉 Sending tricky dad report");

    await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: reportChatId,
        parseMode: "MarkdownV2",
        text,
        ...(shouldReply && { replyToMessageId }),
    });
}

export async function sendTrickyDadErrorReport({
    command,
    err,
}: {
    command: string;
    err: unknown;
}): Promise<void> {
    logger.info("👉 Sending tricky dad error report");

    await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: OBSIDIAN_TASKS_CHAT_ID,
        parseMode: "MarkdownV2",
        text: escapeTelegramMarkdownV2(
            `❌ Failed to process command=[${command}]: ${err instanceof Error ? err.message : String(err)}`,
        ),
    });
}
