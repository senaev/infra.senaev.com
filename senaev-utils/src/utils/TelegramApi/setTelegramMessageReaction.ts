import { callTelegramApi } from './callTelegramApi';

export async function setTelegramMessageReaction({
    chatId,
    messageId,
    token,
    reactions,
}: {
    chatId: string | number;
    messageId: number;
    token: string;
    reactions: string[];
}): Promise<void> {
    await callTelegramApi({
        method: 'setMessageReaction',
        token,
        body: {
            chat_id: chatId,
            message_id: messageId,
            reaction: reactions.map((emoji) => {
                return {
                    type: 'emoji',
                    emoji,
                };
            }),
        },
    });
}
