import { callTelegramApi } from './callTelegramApi';

export function sendTelegramMessage({
    text,
    chatId,
    token,
    parseMode,
    disableLinkPreview,
    replyToMessageId,
    replyMarkup,
}: {
    text: string;
    chatId: string;
    token: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    disableLinkPreview?: boolean;
    replyToMessageId?: number;
    replyMarkup?: {
        inline_keyboard: Array<
            Array<{
                text: string;
                copy_text: {
                    text: string;
                };
            }>
        >;
    };
}): Promise<{ message_id: number }> {
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
