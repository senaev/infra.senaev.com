import { callTelegramApi } from 'senaev-utils/src/utils/TelegramApi/callTelegramApi';
import type { TelegramMessage, TelegramUpdate } from 'senaev-utils/src/utils/TelegramApi/types';

export type MessageBatch = {
    messages: TelegramMessage[];
    nextOffset: number | undefined;
};

export async function getTelegramMessages({
    token,
    offset,
    timeoutSeconds,
}: {
    token: string;
    offset: number | undefined;
    timeoutSeconds: number;
}): Promise<MessageBatch> {
    const updates = await callTelegramApi<TelegramUpdate[]>({
        method: 'getUpdates',
        token,
        body: {
            offset,
            timeout: timeoutSeconds,
            allowed_updates: ['message'],
        },
    });
    const lastUpdate = updates.at(-1);

    return {
        messages: updates.flatMap(({ message }) => message === undefined ? [] : [message]),
        nextOffset: lastUpdate === undefined ? undefined : lastUpdate.update_id + 1,
    };
}

export async function deleteTelegramMessage({
    token,
    chatId,
    messageId,
}: {
    token: string;
    chatId: number;
    messageId: number;
}): Promise<void> {
    await callTelegramApi({
        method: 'deleteMessage',
        token,
        body: {
            chat_id: chatId,
            message_id: messageId,
        },
    });
}
