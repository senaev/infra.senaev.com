import { getTelegramCommandFromMessage } from 'senaev-utils/src/utils/TelegramApi/getTelegramCommandFromMessage/getTelegramCommandFromMessage';
import type { TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';

import { logger } from './logger';
import type { LoginAssistant } from './loginAssistant';

export type MessageRouterDependencies = {
    // The user id and the chat id are the same in a private chat, so one number is the only allowed chat.
    allowedUserId: number;
    assistant: LoginAssistant;
    deleteMessage(chatId: number, messageId: number): Promise<void>;
};

// The text of a message is never logged: it can be a login code.
export function createMessageRouter(dependencies: MessageRouterDependencies): (message: TelegramMessage) => Promise<void> {
    return async (message) => {
        const messageId = message.message_id;

        // Strangers get no answer at all, so the bot does not show that it exists.
        if (message.from?.id !== dependencies.allowedUserId || message.chat.id !== dependencies.allowedUserId) {
            logger.warn({
                messageId,
                userId: message.from?.id,
                chatId: message.chat.id,
            }, '⛔ Ignored a message from a user or chat that is not allowed');

            return;
        }

        const text = message.text?.trim();

        if (text === undefined || text === '') {
            logger.info({ messageId }, '👉 Ignored a message without text');

            return;
        }

        const command = getTelegramCommandFromMessage(text);

        if (command !== undefined) {
            if (command.commandName !== 'auth') {
                logger.info({
                    messageId,
                    command: command.commandName,
                }, '👉 Ignored an unknown command');

                return;
            }

            logger.info({ messageId }, '👉 Handling the /auth command');
            await dependencies.assistant.handleAuthCommand();
            logger.info({ messageId }, '✅ Handled the /auth command');

            return;
        }

        logger.info({ messageId }, '👉 Handling a text message');
        const wasCode = await dependencies.assistant.handleText(text);

        if (!wasCode) {
            logger.info({ messageId }, '✅ Handled a text message that is not a login code');

            return;
        }

        logger.info({ messageId }, '✅ Handled a login code');

        // The code works once and is already used, but it does not need to stay in the chat.
        logger.info({ messageId }, '👉 Deleting the message with the login code');
        try {
            await dependencies.deleteMessage(message.chat.id, messageId);
            logger.info({ messageId }, '✅ Deleted the message with the login code');
        } catch (error) {
            logger.warn({
                err: error,
                messageId,
            }, '⚠️ Could not delete the message with the login code');
        }
    };
}
