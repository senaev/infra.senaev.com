import { getTelegramCommandFromMessage } from 'senaev-utils/src/utils/TelegramApi/getTelegramCommandFromMessage/getTelegramCommandFromMessage';
import type { TelegramCallbackQuery, TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';

import { CODEX_LOGOUT_BUTTON_DATA, type CodexLogin } from './codexLogin';
import { logger } from './logger';
import type { LoginAssistant } from './loginAssistant';
import { parseMcpButtonData } from './mcp';

export type MessageRouterDependencies = {
    // The user id and the chat id are the same in a private chat, so one number is the only allowed chat.
    allowedUserId: number;
    assistant: LoginAssistant;
    // Only when the Codex login folder is mounted in this container.
    codexLogin?: CodexLogin;
    deleteMessage(chatId: number, messageId: number): Promise<void>;
    answerCallbackQuery(callbackQueryId: string, text: string): Promise<void>;
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
            await dependencies.assistant.handleMcpCommand();
            logger.info({ messageId }, '✅ Handled the /mcp command');

            return;
        }

        if (command?.commandName === 'codex_auth' && dependencies.codexLogin !== undefined) {
            logger.info({ messageId }, '👉 Handling the /codex_auth command');
            await dependencies.codexLogin.handleAuthCommand();
            logger.info({ messageId }, '✅ Handled the /codex_auth command');

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

// The buttons of the MCP panel. As in the torrent search, the press is answered with a short
// notice once its action is done, and the panel message is rewritten in place.
export function createCallbackQueryRouter(dependencies: MessageRouterDependencies): (callbackQuery: TelegramCallbackQuery) => Promise<void> {
    async function answer(callbackQueryId: string, text: string): Promise<void> {
        try {
            await dependencies.answerCallbackQuery(callbackQueryId, text);
        } catch (error) {
            // A press older than a few minutes cannot be answered any more; its action is done.
            logger.warn({
                err: error,
                callbackQueryId,
            }, '⚠️ Could not answer a button press');
        }
    }

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

        if (callbackQuery.data === CODEX_LOGOUT_BUTTON_DATA && dependencies.codexLogin !== undefined) {
            logger.info({ callbackQueryId }, '👉 Handling the Codex logout button');

            try {
                const notice = await dependencies.codexLogin.handleLogoutButton(callbackQuery.message?.message_id);

                logger.info({ callbackQueryId }, '✅ Handled the Codex logout button');
                await answer(callbackQueryId, notice);
            } catch (error) {
                logger.error({
                    callbackQueryId,
                    err: error,
                }, '❌ Could not handle the Codex logout button');
                await answer(callbackQueryId, '❌ Something went wrong, see the logs');
            }

            return;
        }

        const button = parseMcpButtonData(callbackQuery.data ?? '');

        if (button === undefined) {
            logger.info({ callbackQueryId }, '👉 Ignored an unknown button');
            await answer(callbackQueryId, '❓ Unknown button');

            return;
        }

        const context = {
            callbackQueryId,
            action: button.action,
            server: button.serverName,
        };

        logger.info(context, '👉 Handling an MCP button');

        try {
            const notice = await dependencies.assistant.handleMcpButton(button.action, button.serverName, callbackQuery.message?.message_id);

            logger.info(context, '✅ Handled an MCP button');
            await answer(callbackQueryId, notice);
        } catch (error) {
            logger.error({
                ...context,
                err: error,
            }, '❌ Could not handle an MCP button');
            await answer(callbackQueryId, '❌ Something went wrong, see the logs');
        }
    };
}
