import { callTelegramApi } from './callTelegramApi';
import { InlineKeyboardMarkup } from './types';

export type SendTelegramMessageParameters = {
    text: string;
    chatId: string;
    token: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    disableLinkPreview?: boolean;
    replyToMessageId?: number;
    replyMarkup?: InlineKeyboardMarkup;
};

export function sendTelegramMessage({
    text,
    chatId,
    token,
    parseMode,
    disableLinkPreview,
    replyToMessageId,
    replyMarkup,
}: SendTelegramMessageParameters): Promise<{ message_id: number }> {
    return callTelegramApi<{ message_id: number }>({
        method: 'sendMessage',
        token,
        body: {
            chat_id: chatId,
            text,
            ...(parseMode && { parse_mode: parseMode }),
            ...(disableLinkPreview !== undefined && {
                link_preview_options: {
                    is_disabled: disableLinkPreview,
                },
            }),
            ...(replyMarkup && { reply_markup: replyMarkup }),
            ...(replyToMessageId && {
                reply_parameters: { message_id: replyToMessageId },
            }),
        },
    });
}
