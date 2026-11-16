import { getTelegramCommandFromMessage } from 'senaev-utils/src/utils/TelegramApi/getTelegramCommandFromMessage/getTelegramCommandFromMessage';
import type { TelegramCallbackQuery, TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';

import { logger } from './logger';
import type { LoginAssistant } from './loginAssistant';
import { parseMcpButtonData } from './mcp';

export type MessageRouterDependencies = {
    // The user id and the chat id are the same in a private chat, so one number is the only allowed chat.
    allowedUserId: number;
    assistant: LoginAssistant;
    deleteMessage(chatId: number, messageId: number): Promise<void>;
    answerCallbackQuery(callbackQueryId: string): Promise<void>;
};

// The text of a message is never logged: it can be a login code or a redirect URL with a code.
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

        if (command?.commandName === 'mcp') {
            logger.info({ messageId }, '👉 Handling the /mcp command');
            await dependencies.assistant.handleMcpCommand(command.commandArgument);
            logger.info({ messageId }, '✅ Handled the /mcp command');

            return;
        }

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

// The buttons of the MCP panel. Telegram shows a loading indicator until the press is answered,
// so it is answered first: a login link can take a while.
export function createCallbackQueryRouter(dependencies: MessageRouterDependencies): (callbackQuery: TelegramCallbackQuery) => Promise<void> {
    return async (callbackQuery) => {
        const callbackQueryId = callbackQuery.id;
        const chatId = callbackQuery.message?.chat.id;

        if (callbackQuery.from.id !== dependencies.allowedUserId || (chatId !== undefined && chatId !== dependencies.allowedUserId)) {
            logger.warn({
                callbackQueryId,
                userId: callbackQuery.from.id,
                chatId,
            }, '⛔ Ignored a button press from a user or chat that is not allowed');

            return;
        }

        try {
            await dependencies.answerCallbackQuery(callbackQueryId);
        } catch (error) {
            logger.warn({
                err: error,
                callbackQueryId,
            }, '⚠️ Could not answer a button press');
        }

        const button = parseMcpButtonData(callbackQuery.data ?? '');

        if (button === undefined) {
            logger.info({ callbackQueryId }, '👉 Ignored an unknown button');

            return;
        }

        logger.info({
            callbackQueryId,
            action: button.action,
            server: button.serverName,
        }, '👉 Handling an MCP button');
        await dependencies.assistant.handleMcpButton(button.action, button.serverName);
        logger.info({
            callbackQueryId,
            action: button.action,
            server: button.serverName,
        }, '✅ Handled an MCP button');
    };
}
