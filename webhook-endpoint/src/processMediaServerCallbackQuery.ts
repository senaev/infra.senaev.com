import { formatBytes } from "senaev-utils/src/types/Bytes/formatBytes/formatBytes";
import {
    assertUnsignedInteger,
    isUnsignedInteger,
} from "senaev-utils/src/types/Number/UnsignedInteger";
import { isObject } from "senaev-utils/src/utils/Object/isObject";
import { callTelegramApi } from "senaev-utils/src/utils/TelegramApi/callTelegramApi";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TelegramMessage, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { downloadProwlarrRelease, ProwlarrRelease } from "./prowlarr";
import {
    editTelegramMessageWithTorrentSearchView,
    getTorrentSearchRelease,
} from "./torrentSearchTelegram";

export interface TelegramCallbackQuery {
    data?: string;
    from: TelegramUser;
    id: string;
    message?: TelegramMessage;
}

function answerCallbackQuery({
    callbackQueryId,
    text,
}: {
    callbackQueryId: string;
    text: string;
}): Promise<void> {
    return callTelegramApi({
        method: "answerCallbackQuery",
        token: TG_TOKEN_SENAEV_COM_BOT,
        body: {
            callback_query_id: callbackQueryId,
            text,
        },
    });
}

function createDownloadStartedText({
    release,
    startedAt,
    user,
}: {
    release: ProwlarrRelease;
    startedAt: Date;
    user: TelegramUser;
}): string {
    const startedBy = [user.first_name, user.username ? `@${user.username}` : undefined]
        .filter(Boolean)
        .join(" ");

    return [
        "👀 Запрос на загрузку файла получен",
        "",
        `Название: ${release.title ?? "Untitled"}`,
        `Индексер: ${release.indexer ?? "unknown"}`,
        `Размер: ${isUnsignedInteger(release.size) ? formatBytes(release.size) : "no-size"}`,
        `Сиды: ${release.seeders ?? release.peers ?? 0}`,
        `Личи: ${release.leechers ?? "?"}`,
        release.publishDate && `Дата публикации: ${release.publishDate}`,
        release.infoUrl && `Info URL: ${release.infoUrl}`,
        "",
        `Кто: ${startedBy}`,
        `Когда: ${startedAt.toISOString()}`,
    ]
        .filter(Boolean)
        .join("\n");
}

async function editTelegramMessageText({
    chatId,
    messageId,
    text,
}: {
    chatId: number | string;
    messageId: number;
    text: string;
}): Promise<void> {
    await callTelegramApi({
        method: "editMessageText",
        token: TG_TOKEN_SENAEV_COM_BOT,
        body: {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(text),
            reply_markup: {
                inline_keyboard: [],
            },
        },
    });
}

async function sendCallbackQueryErrorMessage({
    errorMessage,
    message,
}: {
    errorMessage: string;
    message: TelegramMessage;
}): Promise<void> {
    await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: String(message.chat.id),
        parseMode: "MarkdownV2",
        text: escapeTelegramMarkdownV2(`❌ ${errorMessage}`),
        replyToMessageId: message.message_id,
    });
}

async function processMediaServerCallbackQueryInternal({
    callbackQuery,
}: {
    callbackQuery: TelegramCallbackQuery;
}): Promise<string> {
    const { data, from, message } = callbackQuery;

    if (!data) {
        throw new Error("Telegram callback query has no data");
    }

    const [namespace, action, sessionId, rawValue] = data.split(":");
    if (namespace !== "torrent") {
        throw new Error("Unsupported action");
    }

    if (!action) {
        throw new Error("Missing action");
    }

    if (!sessionId) {
        throw new Error("Search expired");
    }

    if (rawValue === undefined) {
        throw new Error("Missing value");
    }

    if (!message || !isObject(message.chat)) {
        throw new Error("Search message is gone");
    }

    if (!from) {
        throw new Error("Sender is missing");
    }

    if (action === "page") {
        const page = Number(rawValue);
        assertUnsignedInteger(page);

        console.log(`👉 Opening torrent search page=[${page}], sessionId=[${sessionId}]`);
        await editTelegramMessageWithTorrentSearchView({
            chatId: message.chat.id,
            messageId: message.message_id,
            page,
            sessionId,
        });
        console.log(`✅ Opened torrent search page=[${page}], sessionId=[${sessionId}]`);

        return "👌 Page opened";
    }

    if (action === "download") {
        const releaseIndex = Number(rawValue);
        assertUnsignedInteger(releaseIndex);

        const release = getTorrentSearchRelease({ releaseIndex, sessionId });
        if (!release) {
            throw new Error("☠️ Поиск устарел, запустите новый");
        }

        console.log(
            `👉 Starting torrent download, sessionId=[${sessionId}], releaseIndex=[${releaseIndex}], title=[${release.title}]`,
        );
        await downloadProwlarrRelease(release);

        console.log(`👉 Editing Telegram message with started download details`);
        await editTelegramMessageText({
            chatId: message.chat.id,
            messageId: message.message_id,
            text: createDownloadStartedText({
                release,
                startedAt: new Date(),
                user: from,
            }),
        });
        console.log(`✅ Edited Telegram message with started download details`);

        console.log(`✅ Started torrent download, title=[${release.title}]`);

        return "👌 Download started";
    }

    throw new Error("Unsupported action");
}

export async function processMediaServerCallbackQuery({
    callbackQuery,
}: {
    callbackQuery: TelegramCallbackQuery;
}): Promise<void> {
    try {
        const answerText = await processMediaServerCallbackQueryInternal({ callbackQuery });

        console.log(`👉 Answering Telegram callback query text=[${answerText}]`);
        await answerCallbackQuery({ callbackQueryId: callbackQuery.id, text: answerText });
        console.log(`✅ Answered Telegram callback query text=[${answerText}]`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ ${errorMessage}`, { callbackQuery, error });

        console.log(
            `👉 Sending Telegram chat message with callback query error text=[${errorMessage}]`,
        );
        let answerText = "❌ Error details sent to chat";
        try {
            await sendCallbackQueryErrorMessage({ errorMessage, message: callbackQuery.message! });
            console.log(
                `✅ Sent Telegram chat message with callback query error text=[${errorMessage}]`,
            );
        } catch (sendError) {
            answerText = errorMessage;
            console.error(`❌ Failed to send Telegram chat message with callback query error`, {
                callbackQuery,
                errorMessage,
                sendError,
            });
        }

        console.log(`👉 Answering Telegram callback query with error text=[${answerText}]`);
        await answerCallbackQuery({ callbackQueryId: callbackQuery.id, text: answerText });
        console.log(`✅ Answered Telegram callback query with error text=[${answerText}]`);
    }
}
