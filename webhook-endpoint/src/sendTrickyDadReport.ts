import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { logger } from "./logger";
import { HandleTrickyDadRequestResult } from "./processAlisaCommand";

export type TrickyDadReportSource = "Tricky Dad" | "Obsidian Tasks" | "Alisa";

export async function sendTrickyDadReport({
    command,
    source,
    durationSeconds,
    result,
    replyToMessageId,
}: {
    command: string;
    source: TrickyDadReportSource;
    durationSeconds: string;
    result: HandleTrickyDadRequestResult;
    replyToMessageId?: number;
}): Promise<void> {
    const reportChatId =
        result.destination === "grocery" ? TRICKY_DAD_CHAT_ID : OBSIDIAN_TASKS_CHAT_ID;

    const sourceChatId =
        source === "Tricky Dad"
            ? TRICKY_DAD_CHAT_ID
            : source === "Obsidian Tasks"
              ? OBSIDIAN_TASKS_CHAT_ID
              : null; // Alisa has no Telegram source chat

    const shouldReply =
        replyToMessageId !== undefined &&
        sourceChatId !== null &&
        reportChatId === sourceChatId;

    const text = [
        `🗣️ Command: ${command}`,
        `📡 Source: ${source}`,
        `⏱️ Duration: ${durationSeconds}s`,
        `📍 Destination: ${{ grocery: "🛒 grocery", task: "✅ task", fallback: "🔀 fallback" }[result.destination]}`,
        `🤖 OpenRouter time: ${result.openRouterResponseTime}ms`,
        result.supabaseResponseTime !== null && `🗄️ Supabase time: ${result.supabaseResponseTime}ms`,
        result.openRouterError && `❌ OpenRouter Error: ${String(result.openRouterError)}`,
        result.supabaseErrorString && `❌ Supabase Error: ${String(result.supabaseErrorString)}`,
        result.addedItems &&
            `🛒 Added items:\n${result.addedItems.map((item) => `- ${item}`).join("\n")}`,
        result.addedTask && `✅ Added task: ${result.addedTask}`,
    ]
        .filter(Boolean)
        .join("\n");

    logger.info({ reportChatId, source }, "👉 Sending tricky dad report");

    await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: reportChatId,
        parseMode: "MarkdownV2",
        text: escapeTelegramMarkdownV2(text),
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
