import { editTelegramRichMessage } from './editTelegramRichMessage';
import { InlineKeyboardMarkup } from './types';

/** Edit an existing Telegram Rich Markdown message (including progress messages). */
export async function editTelegramMessage({
    chatId, messageId, replyMarkup, text, token, disableLinkPreview,
}: {
    chatId: string;
    messageId: number;
    replyMarkup?: InlineKeyboardMarkup | undefined;
    text: string;
    token: string;
    disableLinkPreview?: boolean;
}): Promise<void> {
    await editTelegramRichMessage({
        chatId,
        messageId,
        markdown: text,
        token,
        media: [],
        ...(replyMarkup && { replyMarkup }),
        ...(disableLinkPreview !== undefined && { disableLinkPreview }),
    });
}
