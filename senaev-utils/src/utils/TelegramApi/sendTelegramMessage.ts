import { createTelegramRichMessage } from './createTelegramRichMessage';
import { InlineKeyboardMarkup } from './types';

export type SendTelegramMessageParameters = {
    /** Telegram Rich Markdown. Escape untrusted content with escapeTelegramMarkdown. */
    text: string;
    chatId: string;
    token: string;
    disableLinkPreview?: boolean;
    replyToMessageId?: number;
    replyMarkup?: InlineKeyboardMarkup;
};

/** A single, rich-only entry point for Telegram messages, including long notifications. */
export async function sendTelegramMessage({
    text, chatId, token, disableLinkPreview, replyToMessageId, replyMarkup,
}: SendTelegramMessageParameters): Promise<{ message_id: number }> {
    const messageId = await createTelegramRichMessage({
        markdown: text,
        chatId,
        token,
        media: [],
        ...(disableLinkPreview !== undefined && { disableLinkPreview }),
        ...(replyToMessageId !== undefined && { replyToMessageId }),
        ...(replyMarkup && { replyMarkup }),
    });

    return { message_id: messageId };
}
