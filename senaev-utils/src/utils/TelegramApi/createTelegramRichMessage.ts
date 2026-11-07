import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { splitTelegramMarkdown } from './splitTelegramMarkdown/splitTelegramMarkdown';
import { InlineKeyboardMarkup, TelegramRichMessageMedia } from './types';

/**
 * Publishes a new rich-message post to a channel and returns its message id.
 *
 * Unlike editing, this is NOT idempotent — every call creates another post. Callers must
 * persist the returned id before anything can trigger a second attempt.
 */
/** Send one or more rich messages. Returns the first message ID for compatibility with callers. */
export async function createTelegramRichMessage({
    chatId,
    markdown,
    media,
    token,
    replyToMessageId,
    replyMarkup,
    disableLinkPreview,
    onRateLimited,
}: {
    chatId: string;
    markdown: string;
    media: TelegramRichMessageMedia[];
    token: string;
    replyToMessageId?: number;
    replyMarkup?: InlineKeyboardMarkup;
    disableLinkPreview?: boolean;
    onRateLimited?: ((info: { retryAfterSeconds: number; attempt: number }) => void) | undefined;
}): Promise<number> {
    const parts = splitTelegramMarkdown(markdown);
    let firstMessageId: number | undefined;

    for (const [
        index,
        part,
    ] of parts.entries()) {
        const result = await callTelegramRichMessageMethod<{ message_id: number }>({
            method: 'sendRichMessage',
            base: {
                chat_id: chatId,
                ...(disableLinkPreview !== undefined && {
                    link_preview_options: JSON.stringify({ is_disabled: disableLinkPreview }),
                }),
                ...(index === 0 && replyToMessageId !== undefined && {
                    reply_parameters: JSON.stringify({ message_id: replyToMessageId }),
                }),
                ...(index === parts.length - 1 && replyMarkup && {
                    reply_markup: JSON.stringify(replyMarkup),
                }),
            },
            markdown: part,
            media: index === 0 ? media : [],
            token,
            onRateLimited,
        });

        if (result.status !== 'ok') {
            throw new Error(`sendRichMessage returned no message for chat ${chatId}`);
        }

        firstMessageId ??= result.result.message_id;
    }

    if (firstMessageId === undefined) {
        throw new Error(`sendRichMessage had no content for chat ${chatId}`);
    }

    return firstMessageId;
}
