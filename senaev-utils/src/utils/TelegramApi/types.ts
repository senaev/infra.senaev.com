/**
 * How Telegram should parse markup in a message, when it should parse any.
 *
 * One member on purpose. Telegram also accepts `MarkdownV2`, which expresses exactly the same
 * entities, so supporting both buys nothing and costs the harder escaping: eighteen reserved
 * characters instead of three, a second rule inside code entities, and a cut through an escape
 * sequence that turns into a rejected message rather than literal text. Omitting the field is
 * still meaningful — it sends plain text, which needs no escaping at all.
 */
export type TelegramParseMode = 'HTML';

export type TelegramUser = {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
};

export type TelegramChat = {
    id: number;
    type: string;
    title?: string;
};

export type ReactionTypeEmoji = {
    type: 'emoji';
    emoji: string;
};

export type ReactionCount = {
    type: ReactionTypeEmoji;
    total_count: number;
};

export type TelegramFile = {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
};

export type TelegramMessage = {
    message_id: number;
    chat: TelegramChat;
    date: number;
    text?: string;
    from?: TelegramUser;
    reaction?: ReactionCount[];
    document?: TelegramFile;
};

export type TelegramUpdate = {
    update_id: number;
    message?: TelegramMessage;
    channel_post?: TelegramMessage;
};

export type TelegramApiResponse<T> = {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
    /** Present on error 429; `retry_after` is the number of seconds to wait. */
    parameters?: { retry_after?: number };
};

/**
 * A button either fires a callback query, copies text, or opens a URL — never more than one,
 * which is why this is a union rather than a record of optional fields.
 */
export type InlineKeyboardButton = { text: string } & (
    | { callback_data: string }
    | { copy_text: { text: string } }
);

export type InlineKeyboardMarkup = {
    inline_keyboard: InlineKeyboardButton[][];
};

/**
 * One photo attached to a rich message.
 *
 * `id` is referenced from the markdown as `tg://photo?id=<id>` and must match
 * `[A-Za-z0-9_-]{1,64}`; the bytes are uploaded from `absolutePath` in the same request.
 */
export type TelegramRichMessageMedia = {
    id: string;
    absolutePath: string;
};

export type TelegramForwardPayload = {
    method: string;
    token: string;
    body?: Record<string, unknown>;
};
