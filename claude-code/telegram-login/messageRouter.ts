import type { LoginAssistant } from './loginAssistant.ts';
import type { TelegramMessage } from './telegram.ts';

export type MessageRouterDependencies = {
    // The user id and the chat id are the same in a private chat, so one number is the only allowed chat.
    allowedUserId: number;
    assistant: LoginAssistant;
    deleteMessage(chatId: number, messageId: number): Promise<void>;
};

const AUTH_COMMAND = /^\/auth(@\w+)?$/;

export function createMessageRouter(dependencies: MessageRouterDependencies): (message: TelegramMessage) => Promise<void> {
    return async (message) => {
        // Strangers get no answer at all, so the bot does not show that it exists.
        if (message.userId !== dependencies.allowedUserId || message.chatId !== dependencies.allowedUserId) {
            return;
        }

        const text = message.text.trim();

        if (AUTH_COMMAND.test(text)) {
            await dependencies.assistant.handleAuthCommand();

            return;
        }

        if (text.startsWith('/')) {
            return;
        }

        const wasCode = await dependencies.assistant.handleText(text);

        if (wasCode) {
            // The code works once and is already used, but it does not need to stay in the chat.
            await dependencies.deleteMessage(message.chatId, message.messageId).catch(() => undefined);
        }
    };
}
