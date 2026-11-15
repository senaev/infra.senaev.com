export type TelegramMessage = {
    messageId: number;
    chatId: number;
    userId: number;
    text: string;
};

export type MessageBatch = {
    messages: TelegramMessage[];
    nextOffset: number | undefined;
};

export type TelegramClient = {
    getMessages(offset: number | undefined, timeoutSeconds: number): Promise<MessageBatch>;
    sendMessage(chatId: number, text: string): Promise<void>;
    deleteMessage(chatId: number, messageId: number): Promise<void>;
};

const API_ORIGIN = 'https://api.telegram.org';

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

// Reads only the fields that the bot uses. Other updates, such as edits and photos, are skipped.
export function parseMessage(update: unknown): TelegramMessage | null {
    const message = asRecord(asRecord(update)?.message);
    const chatId = asRecord(message?.chat)?.id;
    const userId = asRecord(message?.from)?.id;
    const messageId = message?.message_id;
    const text = message?.text;

    if (typeof chatId !== 'number' || typeof userId !== 'number' || typeof messageId !== 'number' || typeof text !== 'string') {
        return null;
    }

    return {
        messageId,
        chatId,
        userId,
        text,
    };
}

export function createTelegramClient(token: string, fetchImplementation: typeof fetch = fetch): TelegramClient {
    async function call(method: string, body: Record<string, unknown>): Promise<unknown> {
        // The URL holds the token, so it must never reach an error message.
        const response = await fetchImplementation(`${API_ORIGIN}/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        const payload = asRecord(await response.json().catch(() => null));

        if (!response.ok || payload?.ok !== true) {
            throw new Error(`Telegram ${method} failed with HTTP ${response.status}`);
        }

        return payload.result;
    }

    return {
        async getMessages(offset, timeoutSeconds) {
            const result = await call('getUpdates', {
                offset,
                timeout: timeoutSeconds,
                allowed_updates: ['message'],
            });
            const updates = Array.isArray(result) ? result as unknown[] : [];
            const lastUpdateId = updates
                .map((update) => asRecord(update)?.update_id)
                .filter((updateId): updateId is number => typeof updateId === 'number')
                .at(-1);

            return {
                messages: updates.map(parseMessage).filter((message): message is TelegramMessage => message !== null),
                nextOffset: lastUpdateId === undefined ? undefined : lastUpdateId + 1,
            };
        },

        async sendMessage(chatId, text) {
            await call('sendMessage', {
                chat_id: chatId,
                text,
                link_preview_options: { is_disabled: true },
            });
        },

        async deleteMessage(chatId, messageId) {
            await call('deleteMessage', {
                chat_id: chatId,
                message_id: messageId,
            });
        },
    };
}
