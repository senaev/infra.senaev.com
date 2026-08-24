import { callTelegramApi } from 'senaev-utils/src/utils/TelegramApi/callTelegramApi';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';

export interface InlineKeyboardMarkup {
    inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
}

export async function editTelegramMessage({
    chatId,
    messageId,
    replyMarkup,
    text,
}: {
    chatId: number | string;
    messageId: number;
    replyMarkup?: InlineKeyboardMarkup | undefined;
    text: string;
}): Promise<void> {
    await callTelegramApi({
        method: 'editMessageText',
        token: TG_TOKEN_SENAEV_COM_BOT,
        body: {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'MarkdownV2',
            link_preview_options: { is_disabled: true },
            ...(replyMarkup && { reply_markup: replyMarkup }),
        },
    });
}

const PROGRESS_UPDATE_INTERVAL_MS = 10_000;

export interface TelegramProgressMessage {
    messageId: number;
    stop: () => void;
}

// Prowlarr can take minutes to answer, both when searching and when handing a release to
// qBittorrent. While it worked the chat stayed silent, so a slow backend and a dead bot
// looked the same. This posts a message straight away and keeps a running second count in
// it; the caller then edits the same message with the outcome, so one action leaves one
// message behind instead of a silent gap followed by a separate answer.
//
// buildText receives the seconds elapsed and must return ready MarkdownV2 -- escaping is
// the caller's business, because the text usually mixes escaped and formatted parts.
export async function startTelegramProgressMessage({
    buildText,
    chatId,
    replyToMessageId,
}: {
    buildText: (elapsedSeconds: number) => string;
    chatId: string;
    replyToMessageId?: number | undefined;
}): Promise<TelegramProgressMessage> {
    const { message_id: messageId } = await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId,
        parseMode: 'MarkdownV2',
        disableLinkPreview: true,
        text: buildText(0),
        ...(replyToMessageId !== undefined && { replyToMessageId }),
    });

    const startedAt = Date.now();
    const timer = setInterval(() => {
        void editTelegramMessage({
            chatId,
            messageId,
            text: buildText(Math.round((Date.now() - startedAt) / 1000)),
        }).catch((err: unknown) => {
            logger.warn({
                err,
                messageId,
            }, '⚠️ Failed to update Telegram progress message');
        });
    }, PROGRESS_UPDATE_INTERVAL_MS);

    return {
        messageId,
        stop: () => clearInterval(timer),
    };
}
