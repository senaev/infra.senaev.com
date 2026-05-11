import { isObject } from "senaev-utils/src/utils/Object/isObject";
import { callTelegramApi } from "senaev-utils/src/utils/TelegramApi/callTelegramApi";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { downloadProwlarrRelease } from "./prowlarr";
import {
    editTelegramMessageWithTorrentSearchView,
    getTorrentSearchRelease,
} from "./torrentSearchTelegram";

export interface TelegramCallbackQuery {
    data?: string;
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

async function processMediaServerCallbackQueryInternal({
    callbackQuery,
}: {
    callbackQuery: TelegramCallbackQuery;
}): Promise<string> {
    const { data, message } = callbackQuery;

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

    if (action === "page") {
        const page = Number(rawValue);
        if (!Number.isInteger(page) || page < 0) {
            throw new Error("Invalid page");
        }

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
        if (!Number.isInteger(releaseIndex) || releaseIndex < 0) {
            throw new Error("Invalid release");
        }

        const release = getTorrentSearchRelease({ releaseIndex, sessionId });
        if (!release) {
            throw new Error("Search expired. Run /torrent again.");
        }

        console.log(
            `👉 Starting torrent download, sessionId=[${sessionId}], releaseIndex=[${releaseIndex}], title=[${release.title}]`,
        );
        await downloadProwlarrRelease(release);

        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: String(message.chat.id),
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(
                `✅ Download started:\n${release.title ?? "Untitled"}`,
            ),
            replyToMessageId: message.message_id,
        });

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

        console.log(`👉 Answering Telegram callback query with error text=[${errorMessage}]`);
        await answerCallbackQuery({ callbackQueryId: callbackQuery.id, text: errorMessage });
        console.log(`✅ Answered Telegram callback query with error text=[${errorMessage}]`);
    }
}
