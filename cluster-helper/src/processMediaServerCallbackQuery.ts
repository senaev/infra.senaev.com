import { formatBytes } from 'senaev-utils/src/types/Bytes/formatBytes/formatBytes';
import {
    assertUnsignedInteger,
    isUnsignedInteger,
} from 'senaev-utils/src/types/Number/UnsignedInteger';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { callTelegramApi } from 'senaev-utils/src/utils/TelegramApi/callTelegramApi';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { TelegramMessage, TelegramUser } from 'senaev-utils/src/utils/TelegramApi/types';
import { escapeTelegramMarkdownV2 } from 'senaev-utils/src/utils/TelegramApi/escapeTelegramMarkdownV2/escapeTelegramMarkdownV2';

import { TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';
import { downloadProwlarrRelease, ProwlarrRelease } from './prowlarr';
import { editTelegramMessage, startTelegramProgressMessage } from './telegramMessages';
import {
    editTelegramMessageWithTorrentSearchView,
    getTorrentSearchRelease,
} from './torrentSearchTelegram';

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
        method: 'answerCallbackQuery',
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
    const startedBy = [
        user.first_name,
        user.username ? `@${user.username}` : undefined,
    ]
        .filter(Boolean)
        .join(' ');

    return [
        '👀 Запрос на загрузку файла получен',
        '',
        `Название: ${release.title ?? 'Untitled'}`,
        `Индексер: ${release.indexer ?? 'unknown'}`,
        `Размер: ${isUnsignedInteger(release.size) ? formatBytes(release.size) : 'no-size'}`,
        `Сиды: ${release.seeders ?? release.peers ?? 0}`,
        `Личи: ${release.leechers ?? '?'}`,
        release.publishDate && `Дата публикации: ${release.publishDate}`,
        release.infoUrl && `Info URL: ${release.infoUrl}`,
        '',
        `Кто: ${startedBy}`,
        `Когда: ${startedAt.toISOString()}`,
    ]
        .filter(Boolean)
        .join('\n');
}

function createDownloadProgressText({
    elapsedSeconds,
    release,
}: {
    elapsedSeconds: number;
    release: ProwlarrRelease;
}): string {
    return escapeTelegramMarkdownV2([
        `⬇️ ${release.title ?? 'Untitled'}`,
        '',
        `⏳ Отправляю в qBittorrent… ${elapsedSeconds} сек`,
    ].join('\n'));
}

// Telegram rejects a sendMessage longer than 4096 characters. A failing Prowlarr call
// answers with the whole .NET stack trace -- 6493 characters in one observed case -- so
// the message was refused and the error never reached the chat. The head of it is enough
// to see what broke, and the logs still carry the untruncated text.
const MAX_TELEGRAM_ERROR_MESSAGE_LENGTH = 1024;
const TRUNCATION_ELLIPSIS = '…';

function truncateErrorMessage(errorMessage: string): string {
    if (errorMessage.length <= MAX_TELEGRAM_ERROR_MESSAGE_LENGTH) {
        return errorMessage;
    }

    const head = errorMessage.slice(
        0,
        MAX_TELEGRAM_ERROR_MESSAGE_LENGTH - TRUNCATION_ELLIPSIS.length
    );

    return `${head}${TRUNCATION_ELLIPSIS}`;
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
        parseMode: 'MarkdownV2',
        text: escapeTelegramMarkdownV2(`❌ ${truncateErrorMessage(errorMessage)}`),
        replyToMessageId: message.message_id,
    });
}

interface DownloadProgress {
    messageId?: number;
}

async function processMediaServerCallbackQueryInternal({
    callbackQuery,
    progress,
}: {
    callbackQuery: TelegramCallbackQuery;
    progress: DownloadProgress;
}): Promise<string> {
    const {
        data, from, message,
    } = callbackQuery;

    if (!data) {
        throw new Error('Telegram callback query has no data');
    }

    const [
        namespace,
        action,
        sessionId,
        rawValue,
    ] = data.split(':');

    if (namespace !== 'torrent') {
        throw new Error('Unsupported action');
    }

    if (!action) {
        throw new Error('Missing action');
    }

    if (!sessionId) {
        throw new Error('Search expired');
    }

    if (rawValue === undefined) {
        throw new Error('Missing value');
    }

    if (!message || !isObject(message.chat)) {
        throw new Error('Search message is gone');
    }

    if (!from) {
        throw new Error('Sender is missing');
    }

    if (action === 'page') {
        const page = Number(rawValue);

        assertUnsignedInteger(page);

        logger.info({
            page,
            sessionId,
        }, '👉 Opening torrent search page');
        await editTelegramMessageWithTorrentSearchView({
            chatId: message.chat.id,
            messageId: message.message_id,
            page,
            sessionId,
        });
        logger.info({
            page,
            sessionId,
        }, '✅ Opened torrent search page');

        return '👌 Page opened';
    }

    if (action === 'download') {
        const releaseIndex = Number(rawValue);

        assertUnsignedInteger(releaseIndex);

        const release = getTorrentSearchRelease({
            releaseIndex,
            sessionId,
        });

        if (!release) {
            throw new Error('☠️ Поиск устарел, запустите новый');
        }

        logger.info(
            {
                sessionId,
                releaseIndex,
                title: release.title,
            },
            '👉 Starting torrent download'
        );

        // Handing a release to qBittorrent goes through Prowlarr and can take minutes, so
        // this reports into its own message rather than overwriting the search results --
        // the result list keeps its buttons and stays usable for the next release.
        const progressMessage = await startTelegramProgressMessage({
            chatId: String(message.chat.id),
            replyToMessageId: message.message_id,
            buildText: (elapsedSeconds) => createDownloadProgressText({
                elapsedSeconds,
                release,
            }),
        });

        progress.messageId = progressMessage.messageId;

        try {
            await downloadProwlarrRelease(release);
        } finally {
            progressMessage.stop();
        }

        logger.info('👉 Editing Telegram message with started download details');
        await editTelegramMessage({
            chatId: message.chat.id,
            messageId: progressMessage.messageId,
            text: escapeTelegramMarkdownV2(createDownloadStartedText({
                release,
                startedAt: new Date(),
                user: from,
            })),
        });
        logger.info({ title: release.title }, '✅ Started torrent download');

        return '👌 Download started';
    }

    throw new Error('Unsupported action');
}

export async function processMediaServerCallbackQuery({
    callbackQuery,
}: {
    callbackQuery: TelegramCallbackQuery;
}): Promise<void> {
    const progress: DownloadProgress = {};

    try {
        const answerText = await processMediaServerCallbackQueryInternal({
            callbackQuery,
            progress,
        });

        logger.info({ answerText }, '👉 Answering Telegram callback query');
        await answerCallbackQuery({
            callbackQueryId: callbackQuery.id,
            text: answerText,
        });
        logger.info({ answerText }, '✅ Answered Telegram callback query');
    } catch (error) {
        const errorMessage = stringifyUnknownError(error);

        logger.error({
            err: error,
            callbackQuery,
        }, errorMessage);

        logger.info({ errorMessage }, '👉 Sending Telegram chat message with callback query error');
        let answerText = '❌ Error details sent to chat';

        try {
            // The download already has a message of its own counting the seconds, so put the
            // failure there instead of leaving it stuck on the last tick beside a new message.
            if (progress.messageId === undefined) {
                await sendCallbackQueryErrorMessage({
                    errorMessage,
                    message: callbackQuery.message!,
                });
            } else {
                await editTelegramMessage({
                    chatId: callbackQuery.message!.chat.id,
                    messageId: progress.messageId,
                    text: escapeTelegramMarkdownV2(`❌ ${truncateErrorMessage(errorMessage)}`),
                });
            }

            logger.info({ errorMessage }, '✅ Sent Telegram chat message with callback query error');
        } catch (sendError) {
            answerText = errorMessage;
            logger.error(
                {
                    err: sendError,
                    callbackQuery,
                    errorMessage,
                },
                '❌ Failed to send Telegram chat message with callback query error'
            );
        }

        logger.info({ answerText }, '👉 Answering Telegram callback query with error');
        await answerCallbackQuery({
            callbackQueryId: callbackQuery.id,
            text: answerText,
        });
        logger.info({ answerText }, '✅ Answered Telegram callback query with error');
    }
}
