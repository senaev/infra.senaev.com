import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { TelegramRichMessageMedia } from './types';

export type EditRichMessageResult = 'updated' | 'unchanged';

/**
 * Rewrites an existing channel post with rich-message content.
 *
 * Requires the bot to be a channel administrator with `can_edit_messages`, which is what
 * allows it to edit posts it did not author.
 */
export async function editTelegramRichMessage({
    chatId,
    messageId,
    markdown,
    media,
    token,
    onRateLimited,
}: {
    chatId: string;
    messageId: number;
    markdown: string;
    media: TelegramRichMessageMedia[];
    token: string;
    onRateLimited?: ((info: { retryAfterSeconds: number; attempt: number }) => void) | undefined;
}): Promise<EditRichMessageResult> {
    const result = await callTelegramRichMessageMethod<unknown>({
        method: 'editMessageText',
        base: {
            chat_id: chatId,
            message_id: String(messageId),
        },
        markdown,
        media,
        token,
        onRateLimited,
    });

    return result.status === 'ok' ? 'updated' : 'unchanged';
}
