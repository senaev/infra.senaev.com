import type { ResolvedEmbed } from '../telegram-post-sync/render/resolveImageEmbeds';

import { callRichMessageMethod } from './callRichMessageMethod';

/**
 * Publishes a new rich-message post to a channel and returns its message id.
 *
 * Unlike editing, this is NOT idempotent — every call creates another post. Callers must
 * persist the returned id before anything can trigger a second attempt.
 */
export async function createTelegramRichMessage({
    chatId,
    markdown,
    media,
}: {
    chatId: string;
    markdown: string;
    media: ResolvedEmbed[];
}): Promise<number> {
    const result = await callRichMessageMethod<{ message_id: number }>({
        method: 'sendRichMessage',
        base: { chat_id: chatId },
        markdown,
        media,
    });

    if (result.status !== 'ok') {
        throw new Error(`sendRichMessage returned no message for chat ${chatId}`);
    }

    return result.result.message_id;
}
