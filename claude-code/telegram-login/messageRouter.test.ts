import type { TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';
import {
    describe, expect, it, vi,
} from 'vitest';

import type { LoginAssistant } from './loginAssistant';
import { createMessageRouter } from './messageRouter';

const ALLOWED_USER_ID = 42;

function setup(handleTextResult = true) {
    const assistant: LoginAssistant = {
        handleAuthCommand: vi.fn(() => Promise.resolve()),
        handleText: vi.fn(() => Promise.resolve(handleTextResult)),
        checkLogin: vi.fn(() => Promise.resolve()),
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
    it('starts a login on /auth, also when the command names the bot', async () => {
        const { assistant, route } = setup();

        await route(message({ text: '/auth' }));
        await route(message({ text: '/auth@senaev_claude_helper_bot' }));

        expect(assistant.handleAuthCommand).toHaveBeenCalledTimes(2);
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
    });

    it('keeps the message when it was not a code', async () => {
        const { deleteMessage, route } = setup(false);

        await route(message({ text: 'hello' }));

        expect(deleteMessage).not.toHaveBeenCalled();
    });

    it('does not fail when the message cannot be deleted', async () => {
        const { deleteMessage, route } = setup(true);

        deleteMessage.mockRejectedValueOnce(new Error('too old'));

        await expect(route(message({ text: 'code' }))).resolves.toBeUndefined();
    });

    it('ignores other commands and messages without text', async () => {
        const { assistant, route } = setup();

        await route(message({ text: '/start' }));
        await route(message({ text: null }));

        expect(assistant.handleAuthCommand).not.toHaveBeenCalled();
        expect(assistant.handleText).not.toHaveBeenCalled();
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
    });
});
