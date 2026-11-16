import type { TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';
import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { logger } from './logger';
import type { LoginAssistant } from './loginAssistant';
import { createMessageRouter } from './messageRouter';

vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
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

function setup(handleTextResult = true) {
    const assistant: LoginAssistant = {
        handleAuthCommand: vi.fn(() => Promise.resolve()),
        handleMcpCommand: vi.fn(() => Promise.resolve()),
        handleText: vi.fn(() => Promise.resolve(handleTextResult)),
        checkLogin: vi.fn(() => Promise.resolve()),
        checkMcpServers: vi.fn(() => Promise.resolve()),
        stop: vi.fn(),
    };
    const deleteMessage = vi.fn((): Promise<void> => Promise.resolve());
    const route = createMessageRouter({
        allowedUserId: ALLOWED_USER_ID,
        assistant,
        deleteMessage,
    });

    return {
        assistant,
        deleteMessage,
        route,
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

    it('passes the server name of /mcp to the assistant', async () => {
        const { assistant, route } = setup();

        await route(message({ text: '/mcp' }));
        await route(message({ text: '/mcp@senaev_claude_helper_bot datadog' }));

        expect(assistant.handleMcpCommand).toHaveBeenNthCalledWith(1, '');
        expect(assistant.handleMcpCommand).toHaveBeenNthCalledWith(2, 'datadog');
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
