import { downloadFileFromTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/downloadFileFromTelegramMessage';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { setTelegramMessageReaction } from 'senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction';
import { TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';
import { escapeTelegramMarkdownV2 } from 'senaev-utils/src/utils/TelegramApi/escapeTelegramMarkdownV2/escapeTelegramMarkdownV2';
import { type TelegramProgressMessage } from 'senaev-utils/src/utils/TelegramApi/startTelegramProgressMessage';

import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';
import { parseTextOrAudioMessageFromTelegram } from './parseTextOrAudioMessageFromTelegram';
import { searchProwlarr } from './prowlarr';
import { enqueueTorrentFile } from './torrentOutbox';
import { startTelegramMarkdownProgressMessage } from './telegramMarkdownMessages';
import {
    buildTorrentSearchProgressText,
    createTorrentSearchView,
} from './torrentSearchTelegram';

interface SearchProgress {
    message?: TelegramProgressMessage;
}

async function processMediaServerChatMessageInternal({ message, progress }: {
    message: TelegramMessage;
    progress: SearchProgress;
}): Promise<string | undefined> {
    const text = await parseTextOrAudioMessageFromTelegram(message);

    if (text) {
        const query = text.trim();

        if (!query) {
            logger.error('❌ Search query is empty');

            return '❌ Search query is empty';
        }

        logger.info({ query }, '👉 Searching torrents in Prowlarr');

        const progressMessage = await startTelegramMarkdownProgressMessage({
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            replyToMessageId: message.message_id,
            buildText: (elapsedSeconds) => buildTorrentSearchProgressText({
                elapsedSeconds,
                query,
            }),
        });

        // Hand the whole handle to the caller, not just the id, so a failed search reports
        // into this same message instead of leaving the placeholder counting forever next to
        // a new error message -- and so that report goes through the same write chain as the
        // refresh rather than racing it.
        progress.message = progressMessage;

        let releases;

        try {
            releases = await searchProwlarr(query);
        } finally {
            // Belt and braces: whatever happens, the refresh must not outlive this call.
            progressMessage.stopRefresh();
        }

        logger.info({ count: releases.length }, '✅ Found torrent releases');

        const view = createTorrentSearchView({
            page: 0,
            query,
            releases,
        });

        await progressMessage.finish({
            text: view.text,
            replyMarkup: view.replyMarkup,
        });

        logger.info({ sessionId: view.sessionId }, '✅ Sent torrent search results');

        return undefined;
    }

    if (!message.document) {
        logger.error('❌ No documents (torrent files)');

        return undefined;
    }

    const fileName = message.document.file_name ?? message.document.file_id;

    logger.info({ fileName }, '👉 Processing new document message from Telegram channel');
    const { bytes } = await downloadFileFromTelegramMessage({
        fileId: message.document.file_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
    });
    const buffer = Buffer.from(bytes);

    logger.info({ sizeBytes: buffer.length }, '✅ Downloaded file from Telegram');

    logger.info({ fileName }, '👉 Queueing torrent file');
    const outboxItemId = await enqueueTorrentFile({
        buffer,
        fileName,
    });

    logger.info({ outboxItemId }, '✅ File stored in torrent outbox');

    return undefined;
}

export async function processMediaServerChatMessage({ message }: {
    message: TelegramMessage;
}): Promise<void> {
    await setTelegramMessageReaction({
        chatId: message.chat.id,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ['👀'],
    });

    const progress: SearchProgress = {};

    try {
        logger.info('👉 Start processing message in processMediaServerChatMessage');
        const responseMessage = await processMediaServerChatMessageInternal({
            message,
            progress,
        });

        logger.info({ responseMessage }, '✅ Finish processing message in processMediaServerChatMessage');

        if (responseMessage) {
            logger.info({ responseMessage }, '👉 Sending response message');
            await sendTelegramMessage({
                token: TG_TOKEN_SENAEV_COM_BOT,
                chatId: TG_MEDIA_SERVER_CHAT_ID,
                parseMode: 'MarkdownV2',
                text: escapeTelegramMarkdownV2(responseMessage),
                replyToMessageId: message.message_id,
            });
            logger.info('✅ Sent response message');
        }
    } catch (error) {
        const errorMessage = `❌ ${error}`;

        logger.error(error, '❌ processMediaServerChatMessage error');

        if (progress.message) {
            logger.info('👉 Editing torrent search message with error');
            await progress.message.finish({ text: escapeTelegramMarkdownV2(errorMessage) });
            logger.info('✅ Edited torrent search message with error');

            return;
        }

        logger.info('👉 Sending error message');
        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            parseMode: 'MarkdownV2',
            text: escapeTelegramMarkdownV2(errorMessage),
            replyToMessageId: message.message_id,
        });
        logger.info('✅ Sent error message');
    }
}
