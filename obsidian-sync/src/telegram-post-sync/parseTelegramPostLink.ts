// Private channel post links only, e.g. https://t.me/c/1728968094/85
// Public links (https://t.me/<username>/85) need a different chat_id resolution path and
// are out of scope.
const PRIVATE_POST_LINK = /^https:\/\/t\.me\/c\/(\d+)\/(\d+)\/?$/;

export type TelegramPostRef = {
    chatId: string;
    messageId: number;
};

/**
 * Converts a private channel post URL into the chat/message pair the Bot API needs.
 *
 * The `/c/<id>/` segment is the internal channel id; the Bot API expects it prefixed
 * with `-100`.
 */
export function parseTelegramPostLink(link: string): TelegramPostRef | null {
    const match = PRIVATE_POST_LINK.exec(link.trim());
    if (!match) {
        return null;
    }

    const [, internalChatId, messageId] = match;
    if (internalChatId === undefined || messageId === undefined) {
        return null;
    }

    return { chatId: `-100${internalChatId}`, messageId: Number(messageId) };
}
