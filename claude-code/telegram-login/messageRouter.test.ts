import type { TelegramCallbackQuery, TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';
import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import type { CodexLogin } from './codexLogin';
import { logger } from './logger';
import type { LoginAssistant } from './loginAssistant';
import { createCallbackQueryRouter, createMessageRouter } from './messageRouter';

vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

function loggedMessages(): string[] {
    return [
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.warn).mock.calls,
    ].map(([
        , text,
    ]) => String(text));
}

const ALLOWED_USER_ID = 42;

function setup(handleTextResult = true, withCodex = false) {
    const assistant: LoginAssistant = {
        handleAuthCommand: vi.fn(() => Promise.resolve()),
        handleMcpCommand: vi.fn(() => Promise.resolve()),
        handleMcpButton: vi.fn(() => Promise.resolve('🚪 Logged out')),
        handleText: vi.fn(() => Promise.resolve(handleTextResult)),
        checkLogin: vi.fn(() => Promise.resolve()),
        checkMcpServers: vi.fn(() => Promise.resolve()),
        stop: vi.fn(),
    };
    const deleteMessage = vi.fn((): Promise<void> => Promise.resolve());
    const answerCallbackQuery = vi.fn((): Promise<void> => Promise.resolve());
    const codexLogin: CodexLogin = {
        handleAuthCommand: vi.fn(() => Promise.resolve()),
        checkLogin: vi.fn(() => Promise.resolve()),
        stop: vi.fn(),
    };
    const dependencies = {
        allowedUserId: ALLOWED_USER_ID,
        assistant,
        ...(withCodex && { codexLogin }),
        deleteMessage,
        answerCallbackQuery,
    };

    return {
        assistant,
        codexLogin,
        deleteMessage,
        answerCallbackQuery,
        route: createMessageRouter(dependencies),
        routeCallbackQuery: createCallbackQueryRouter(dependencies),
    };
}

// A null text is a message without text, such as a photo.
function message({
    text = 'hello',
    userId = ALLOWED_USER_ID,
    chatId = ALLOWED_USER_ID,
    messageId = 7,
}: {
    text?: string | null;
    userId?: number;
    chatId?: number;
    messageId?: number;
}): TelegramMessage {
    return {
        message_id: messageId,
        chat: {
            id: chatId,
            type: 'private',
        },
        date: 0,
        from: {
            id: userId,
            is_bot: false,
            first_name: 'Andrei',
            username: 'senaev',
        },
        ...text === null ? {} : { text },
    };
}

describe('the message router', () => {
    beforeEach(() => {
        vi.mocked(logger.info).mockClear();
        vi.mocked(logger.warn).mockClear();
    });

    it('starts a login on /auth, also when the command names the bot', async () => {
        const { assistant, route } = setup();

        await route(message({ text: '/auth' }));
        await route(message({ text: '/auth@senaev_claude_helper_bot' }));

        expect(assistant.handleAuthCommand).toHaveBeenCalledTimes(2);
        expect(loggedMessages()).toEqual([
            '👉 Handling the /auth command',
            '✅ Handled the /auth command',
            '👉 Handling the /auth command',
            '✅ Handled the /auth command',
        ]);
    });

    it('starts a Codex login on /codex_auth when Codex is enabled', async () => {
        const {
            assistant, codexLogin, route,
        } = setup(true, true);

        await route(message({ text: '/codex_auth' }));

        expect(codexLogin.handleAuthCommand).toHaveBeenCalledTimes(1);
        expect(assistant.handleAuthCommand).not.toHaveBeenCalled();
        expect(loggedMessages()).toEqual([
            '👉 Handling the /codex_auth command',
            '✅ Handled the /codex_auth command',
        ]);
    });

    it('ignores /codex_auth as an unknown command when Codex is not enabled', async () => {
        const { codexLogin, route } = setup();

        await route(message({ text: '/codex_auth' }));

        expect(codexLogin.handleAuthCommand).not.toHaveBeenCalled();
        expect(loggedMessages()).toEqual(['👉 Ignored an unknown command']);
    });

    it('posts the MCP panel on /mcp, with or without more words', async () => {
        const { assistant, route } = setup();

        await route(message({ text: '/mcp' }));
        await route(message({ text: '/mcp@senaev_claude_helper_bot datadog' }));

        expect(assistant.handleMcpCommand).toHaveBeenCalledTimes(2);
        expect(assistant.handleText).not.toHaveBeenCalled();
    });

    it('gives other text to the assistant and deletes the message when it was a code', async () => {
        const {
            assistant, deleteMessage, route,
        } = setup(true);

        await route(message({
            text: 'the-code#state',
            messageId: 9,
        }));

        expect(assistant.handleText).toHaveBeenCalledWith('the-code#state');
        expect(deleteMessage).toHaveBeenCalledWith(ALLOWED_USER_ID, 9);
        expect(loggedMessages()).toEqual([
            '👉 Handling a text message',
            '✅ Handled a login code',
            '👉 Deleting the message with the login code',
            '✅ Deleted the message with the login code',
        ]);
    });

    it('never logs the text of a message', async () => {
        const { route } = setup(true);

        await route(message({ text: 'the-code#state' }));

        const logged = JSON.stringify([
            ...vi.mocked(logger.info).mock.calls,
            ...vi.mocked(logger.warn).mock.calls,
        ]);

        expect(logged).not.toContain('the-code');
    });

    it('keeps the message when it was not a code', async () => {
        const { deleteMessage, route } = setup(false);

        await route(message({ text: 'hello' }));

        expect(deleteMessage).not.toHaveBeenCalled();
        expect(loggedMessages()).toEqual([
            '👉 Handling a text message',
            '✅ Handled a text message that is not a login code',
        ]);
    });

    it('does not fail when the message cannot be deleted', async () => {
        const { deleteMessage, route } = setup(true);

        deleteMessage.mockRejectedValueOnce(new Error('too old'));

        await expect(route(message({ text: 'code' }))).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ messageId: 7 }),
            '⚠️ Could not delete the message with the login code'
        );
    });

    it('ignores other commands and messages without text', async () => {
        const { assistant, route } = setup();

        await route(message({ text: '/start' }));
        await route(message({ text: null }));

        expect(assistant.handleAuthCommand).not.toHaveBeenCalled();
        expect(assistant.handleText).not.toHaveBeenCalled();
        expect(loggedMessages()).toEqual([
            '👉 Ignored an unknown command',
            '👉 Ignored a message without text',
        ]);
    });

    it('ignores every message of another user or another chat', async () => {
        const { assistant, route } = setup();

        await route(message({
            userId: 1,
            text: '/auth',
        }));
        await route(message({
            chatId: -100,
            text: '/auth',
        }));
        await route(message({
            userId: 1,
            text: 'code',
        }));

        expect(assistant.handleAuthCommand).not.toHaveBeenCalled();
        expect(assistant.handleText).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(3);
        expect(logger.warn).toHaveBeenCalledWith({
            messageId: 7,
            userId: 1,
            chatId: ALLOWED_USER_ID,
        }, '⛔ Ignored a message from a user or chat that is not allowed');
    });
});

function buttonPress({
    data = 'mcp:login:datadog',
    userId = ALLOWED_USER_ID,
    chatId = ALLOWED_USER_ID,
}: {
    data?: string;
    userId?: number;
    chatId?: number;
}): TelegramCallbackQuery {
    return {
        id: 'query-1',
        from: {
            id: userId,
            is_bot: false,
            first_name: 'Andrei',
            username: 'senaev',
        },
        message: {
            message_id: 3,
            chat: {
                id: chatId,
                type: 'private',
            },
            date: 0,
        },
        data,
    };
}

describe('the button router', () => {
    beforeEach(() => {
        vi.mocked(logger.info).mockClear();
        vi.mocked(logger.warn).mockClear();
    });

    it('passes an MCP button with its message to the assistant, then answers with its notice', async () => {
        const {
            assistant, answerCallbackQuery, routeCallbackQuery,
        } = setup();

        await routeCallbackQuery(buttonPress({ data: 'mcp:logout:my-server' }));

        expect(assistant.handleMcpButton).toHaveBeenCalledWith('logout', 'my-server', 3);
        expect(answerCallbackQuery).toHaveBeenCalledWith('query-1', '🚪 Logged out');
    });

    it('ignores presses of other users and chats without an answer', async () => {
        const {
            assistant, answerCallbackQuery, routeCallbackQuery,
        } = setup();

        await routeCallbackQuery(buttonPress({ userId: 7 }));
        await routeCallbackQuery(buttonPress({ chatId: 7 }));

        expect(answerCallbackQuery).not.toHaveBeenCalled();
        expect(assistant.handleMcpButton).not.toHaveBeenCalled();
    });

    it('answers an unknown button and does nothing else', async () => {
        const {
            assistant, answerCallbackQuery, routeCallbackQuery,
        } = setup();

        await routeCallbackQuery(buttonPress({ data: 'mcp:login:bad name' }));

        expect(answerCallbackQuery).toHaveBeenCalledWith('query-1', '❓ Unknown button');
        expect(assistant.handleMcpButton).not.toHaveBeenCalled();
    });

    it('answers with an error when the button fails, and survives a failed answer', async () => {
        const {
            assistant, answerCallbackQuery, routeCallbackQuery,
        } = setup();

        vi.mocked(assistant.handleMcpButton).mockRejectedValueOnce(new Error('boom'));
        answerCallbackQuery.mockRejectedValueOnce(new Error('query is too old'));

        await expect(routeCallbackQuery(buttonPress({}))).resolves.toBeUndefined();
        expect(answerCallbackQuery).toHaveBeenCalledWith('query-1', '❌ Something went wrong, see the logs');
    });
});
