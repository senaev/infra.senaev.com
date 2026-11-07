import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { splitTelegramHtml } from './splitTelegramHtml/splitTelegramHtml';
import { TelegramRichMessageMedia } from './types';

/**
 * Publishes a new rich-message post to a channel and returns its message id.
 *
 * Unlike editing, this is NOT idempotent — every call creates another post. Callers must
 * persist the returned id before anything can trigger a second attempt.
 */
type RichMessageContent = { markdown: string; html?: never } | { html: string; markdown?: never };

/** Send one or more rich messages. Returns the first message ID for compatibility with callers. */
export async function createTelegramRichMessage({
    chatId,
    markdown,
    html,
    media,
    token,
    replyToMessageId,
    onRateLimited,
}: {
    chatId: string;
    media: TelegramRichMessageMedia[];
    token: string;
    replyToMessageId?: number;
    onRateLimited?: ((info: { retryAfterSeconds: number; attempt: number }) => void) | undefined;
} & RichMessageContent): Promise<number> {
    const parts = html === undefined ? [markdown!] : splitTelegramHtml(html);
    let firstMessageId: number | undefined;

    for (const [
        index,
        part,
    ] of parts.entries()) {
        const result = await callTelegramRichMessageMethod<{ message_id: number }>({
            method: 'sendRichMessage',
            base: {
                chat_id: chatId,
                ...(index === 0 && replyToMessageId !== undefined && {
                    reply_parameters: JSON.stringify({ message_id: replyToMessageId }),
                }),
            },
            ...(html === undefined ? { markdown: part } : { html: part }),
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
