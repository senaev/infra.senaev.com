import { callTelegramApi } from './callTelegramApi';

export function sendTelegramMessage({
    text,
    chatId,
    token,
    parseMode,
    replyToMessageId,
    replyMarkup,
}: {
    text: string;
    chatId: string;
    token: string;
    parseMode?: 'HTML' | 'MarkdownV2';
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
            ...(replyMarkup && { reply_markup: replyMarkup }),
            ...(replyToMessageId && {
                reply_parameters: { message_id: replyToMessageId },
            }),
        },
    });
}
