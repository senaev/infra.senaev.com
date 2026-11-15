import { callTelegramApi } from './callTelegramApi';

export async function deleteTelegramMessage({
    token,
    chatId,
    messageId,
}: {
    token: string;
    chatId: string;
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
