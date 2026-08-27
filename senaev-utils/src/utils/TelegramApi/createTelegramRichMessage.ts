import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { TelegramRichMessageMedia } from './types';

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
    token,
    onRateLimited,
}: {
    chatId: string;
    markdown: string;
    media: TelegramRichMessageMedia[];
    token: string;
    onRateLimited?: ((info: { retryAfterSeconds: number; attempt: number }) => void) | undefined;
}): Promise<number> {
    const result = await callTelegramRichMessageMethod<{ message_id: number }>({
        method: 'sendRichMessage',
        base: { chat_id: chatId },
        markdown,
        media,
        token,
        onRateLimited,
    });

    if (result.status !== 'ok') {
        throw new Error(`sendRichMessage returned no message for chat ${chatId}`);
    }

    return result.result.message_id;
}
