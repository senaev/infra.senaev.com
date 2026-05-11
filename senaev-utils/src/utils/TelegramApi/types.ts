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
};

export type TelegramForwardPayload = {
    method: string;
    token: string;
    body?: Record<string, unknown>;
};
