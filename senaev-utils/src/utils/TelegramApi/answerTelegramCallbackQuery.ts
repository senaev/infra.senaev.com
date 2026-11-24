import { callTelegramApi } from './callTelegramApi';

/**
 * Stops the loading indicator on a pressed inline keyboard button. Telegram waits for this answer
 * for every callback query; `text` shows a short notice at the top of the chat.
 */
export async function answerTelegramCallbackQuery({
    token,
    callbackQueryId,
    text,
}: {
    token: string;
    callbackQueryId: string;
    text?: string;
}): Promise<void> {
    await callTelegramApi<boolean>({
        method: 'answerCallbackQuery',
        token,
        body: {
            callback_query_id: callbackQueryId,
            ...(text !== undefined && { text }),
        },
    });
}
