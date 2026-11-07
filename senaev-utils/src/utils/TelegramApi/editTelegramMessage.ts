import { editTelegramRichMessage } from './editTelegramRichMessage';
import { InlineKeyboardMarkup } from './types';

/** Edit an existing Telegram Rich Markdown message (including progress messages). */
export async function editTelegramMessage({
    chatId, messageId, replyMarkup, text, token, disableLinkPreview,
}: {
    chatId: number | string;
    messageId: number;
    replyMarkup?: InlineKeyboardMarkup | undefined;
    text: string;
    token: string;
    disableLinkPreview?: boolean;
}): Promise<void> {
    await editTelegramRichMessage({
        chatId: String(chatId),
        messageId,
        markdown: text,
        token,
        media: [],
        ...(replyMarkup && { replyMarkup }),
        ...(disableLinkPreview !== undefined && { disableLinkPreview }),
    });
}
