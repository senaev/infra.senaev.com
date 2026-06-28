import { downloadFileFromTelegramMessage } from "senaev-utils/src/utils/TelegramApi/downloadFileFromTelegramMessage";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { logger } from "./logger";
import { parseTextOrAudioMessageFromTelegram } from "./parseTextOrAudioMessageFromTelegram";
import { searchProwlarr } from "./prowlarr";
import { enqueueTorrentFile } from "./torrentOutbox";
import { createTorrentSearchView } from "./torrentSearchTelegram";

async function processMediaServerChatMessageInternal({
    botUser,
    message,
}: {
    botUser: TelegramUser;
    message: TelegramMessage;
}): Promise<string | undefined> {
    const text = await parseTextOrAudioMessageFromTelegram(message);

    if (text) {
        const query = text.trim();
        if (!query) {
            logger.error("❌ Search query is empty");
            return "❌ Search query is empty";
        }

        logger.info({ query }, "👉 Searching torrents in Prowlarr");
        const releases = await searchProwlarr(query);
        logger.info({ count: releases.length }, "✅ Found torrent releases");

        const view = createTorrentSearchView({
            page: 0,
            query,
            releases,
        });

        const torrentSearchMessage = {
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            parseMode: "MarkdownV2",
            disableLinkPreview: true,
            text: view.text,
            replyToMessageId: message.message_id,
        } as const;

        if (view.replyMarkup) {
            await sendTelegramMessage({
                ...torrentSearchMessage,
                replyMarkup: view.replyMarkup as unknown as NonNullable<
                    Parameters<typeof sendTelegramMessage>[0]["replyMarkup"]
                >,
            });
        } else {
            await sendTelegramMessage(torrentSearchMessage);
        }

        logger.info({ sessionId: view.sessionId }, "✅ Sent torrent search results");

        return;
    }

    if (!message.document) {
        logger.error("❌ No documents (torrent files)");
        return;
    }

    const fileName = message.document.file_name ?? message.document.file_id;
    logger.info({ fileName }, "👉 Processing new document message from Telegram channel");
    const buffer = Buffer.from(
        await downloadFileFromTelegramMessage({
            fileId: message.document.file_id,
            token: TG_TOKEN_SENAEV_COM_BOT,
        }),
    );
    logger.info({ sizeBytes: buffer.length }, "✅ Downloaded file from Telegram");

    logger.info({ fileName }, "👉 Queueing torrent file");
    const outboxItemId = await enqueueTorrentFile({
        buffer,
        fileName,
    });
    logger.info({ outboxItemId }, "✅ File stored in torrent outbox");

    return;
}

export async function processMediaServerChatMessage({
    botUser,
    message,
}: {
    botUser: TelegramUser;
    message: TelegramMessage;
}): Promise<void> {
    await setTelegramMessageReaction({
        chatId: message.chat.id,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["👀"],
    });

    try {
        logger.info("👉 Start processing message in processMediaServerChatMessage");
        const responseMessage = await processMediaServerChatMessageInternal({
            botUser,
            message,
        });

        logger.info({ responseMessage }, "✅ Finish processing message in processMediaServerChatMessage");

        if (responseMessage) {
            logger.info({ responseMessage }, "👉 Sending response message");
            await sendTelegramMessage({
                token: TG_TOKEN_SENAEV_COM_BOT,
                chatId: TG_MEDIA_SERVER_CHAT_ID,
                parseMode: "MarkdownV2",
                text: escapeTelegramMarkdownV2(responseMessage),
                replyToMessageId: message.message_id,
            });
            logger.info("✅ Sent response message");
        }
    } catch (error) {
        const errorMessage = `❌ ${error}`;

        logger.error(error, "❌ processMediaServerChatMessage error");

        logger.info("👉 Sending error message");
        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(errorMessage),
            replyToMessageId: message.message_id,
        });
        logger.info("✅ Sent error message");
    }
}
