import { callTelegramApi } from './callTelegramApi';
import { InlineKeyboardMarkup, TelegramParseMode } from './types';

/**
 * Rewrites the text of an existing message.
 *
 * The parameter list deliberately mirrors `sendTelegramMessage`, so a caller can post a
 * placeholder and later edit it without reshaping its arguments.
 */
export async function editTelegramMessage({
    chatId,
    messageId,
    replyMarkup,
    text,
    token,
    parseMode,
    disableLinkPreview,
}: {
    chatId: number | string;
    messageId: number;
    replyMarkup?: InlineKeyboardMarkup | undefined;
    text: string;
    token: string;
    parseMode?: TelegramParseMode;
    disableLinkPreview?: boolean;
}): Promise<void> {
    await callTelegramApi({
        method: 'editMessageText',
        token,
        body: {
            chat_id: chatId,
            message_id: messageId,
            text,
            ...(parseMode && { parse_mode: parseMode }),
            ...(disableLinkPreview !== undefined && {
                link_preview_options: { is_disabled: disableLinkPreview },
            }),
            ...(replyMarkup && { reply_markup: replyMarkup }),
        },
    });
}
