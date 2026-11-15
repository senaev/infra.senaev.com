import { getTelegramCommandFromMessage } from 'senaev-utils/src/utils/TelegramApi/getTelegramCommandFromMessage/getTelegramCommandFromMessage';
import type { TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';

import type { LoginAssistant } from './loginAssistant';

export type MessageRouterDependencies = {
    // The user id and the chat id are the same in a private chat, so one number is the only allowed chat.
    allowedUserId: number;
    assistant: LoginAssistant;
    deleteMessage(chatId: number, messageId: number): Promise<void>;
};

export function createMessageRouter(dependencies: MessageRouterDependencies): (message: TelegramMessage) => Promise<void> {
    return async (message) => {
        // Strangers get no answer at all, so the bot does not show that it exists.
        if (message.from?.id !== dependencies.allowedUserId || message.chat.id !== dependencies.allowedUserId) {
            return;
        }

        const text = message.text?.trim();

        if (text === undefined || text === '') {
            return;
        }

        const command = getTelegramCommandFromMessage(text);

        if (command !== undefined) {
            if (command.commandName === 'auth') {
                await dependencies.assistant.handleAuthCommand();
            }

            return;
        }

        const wasCode = await dependencies.assistant.handleText(text);

        if (wasCode) {
            // The code works once and is already used, but it does not need to stay in the chat.
            await dependencies.deleteMessage(message.chat.id, message.message_id).catch(() => undefined);
        }
    };
}
