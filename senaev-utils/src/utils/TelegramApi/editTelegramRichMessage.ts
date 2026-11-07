import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { InlineKeyboardMarkup, TelegramRichMessageMedia } from './types';

export type EditRichMessageResult = 'updated' | 'unchanged';

/**
 * Rewrites an existing rich message in a chat or channel.
 * Editing another sender's channel post requires appropriate permissions.
 */
export async function editTelegramRichMessage({
    chatId,
    messageId,
    markdown,
    replyMarkup,
    disableLinkPreview,
    media,
    token,
    onRateLimited,
}: {
    chatId: string;
    messageId: number;
    markdown: string;
    replyMarkup?: InlineKeyboardMarkup;
    disableLinkPreview?: boolean;
    media: TelegramRichMessageMedia[];
    token: string;
    onRateLimited?: ((info: { retryAfterSeconds: number; attempt: number }) => void) | undefined;
}): Promise<EditRichMessageResult> {
    const result = await callTelegramRichMessageMethod<unknown>({
        method: 'editMessageText',
        base: {
            chat_id: chatId,
            message_id: String(messageId),
            ...(disableLinkPreview !== undefined && {
                link_preview_options: JSON.stringify({ is_disabled: disableLinkPreview }),
            }),
            ...(replyMarkup && { reply_markup: JSON.stringify(replyMarkup) }),
        },
        markdown,
        media,
        token,
        onRateLimited,
    });

    return result.status === 'ok' ? 'updated' : 'unchanged';
}
