import type { ResolvedEmbed } from '../telegram-post-sync/render/resolveImageEmbeds';

import { callRichMessageMethod } from './callRichMessageMethod';

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
}: {
    chatId: string;
    messageId: number;
    markdown: string;
    media: ResolvedEmbed[];
}): Promise<EditRichMessageResult> {
    const result = await callRichMessageMethod<unknown>({
        method: 'editMessageText',
        base: {
            chat_id: chatId,
            message_id: String(messageId),
        },
        markdown,
        media,
    });

    return result.status === 'ok' ? 'updated' : 'unchanged';
}
