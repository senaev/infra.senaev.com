// Private channel links only. Public links (https://t.me/<username>/85) need a different
// chat_id resolution path and are out of scope.
//   https://t.me/c/1728968094/85  -> an existing post to rewrite
//   https://t.me/c/1728968094     -> a channel to publish a new post into
const PRIVATE_POST_LINK = /^https:\/\/t\.me\/c\/(\d+)\/(\d+)\/?$/;
const PRIVATE_CHANNEL_LINK = /^https:\/\/t\.me\/c\/(\d+)\/?$/;

export type TelegramPostTarget =
    | { kind: "post"; chatId: string; messageId: number }
    | { kind: "channel"; chatId: string };

/** The Bot API expects the internal `/c/<id>/` channel id prefixed with `-100`. */
function toChatId(internalChatId: string): string {
    return `-100${internalChatId}`;
}

/** Rebuilds a canonical post link, used when writing a created post id back to the note. */
export function buildTelegramPostLink(chatId: string, messageId: number): string {
    return `https://t.me/c/${chatId.replace(/^-100/, "")}/${messageId}`;
}

/**
 * Resolves a `telegram-post-clone` value into what the sync should do with it: rewrite a
 * specific post, or publish a new one into a channel.
 */
export function parseTelegramPostLink(link: string): TelegramPostTarget | null {
    const trimmed = link.trim();

    const postMatch = PRIVATE_POST_LINK.exec(trimmed);
    if (postMatch) {
        const [, internalChatId, messageId] = postMatch;
        if (internalChatId !== undefined && messageId !== undefined) {
            return { kind: "post", chatId: toChatId(internalChatId), messageId: Number(messageId) };
        }
    }

    const channelMatch = PRIVATE_CHANNEL_LINK.exec(trimmed);
    if (channelMatch) {
        const [, internalChatId] = channelMatch;
        if (internalChatId !== undefined) {
            return { kind: "channel", chatId: toChatId(internalChatId) };
        }
    }

    return null;
}
