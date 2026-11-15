import {
    describe, expect, it, vi,
} from 'vitest';

import type { LoginAssistant } from './loginAssistant.ts';
import { createMessageRouter } from './messageRouter.ts';
import type { TelegramMessage } from './telegram.ts';

const ALLOWED_USER_ID = 42;

function setup(handleTextResult = true) {
    const assistant: LoginAssistant = {
        handleAuthCommand: vi.fn(() => Promise.resolve()),
        handleText: vi.fn(() => Promise.resolve(handleTextResult)),
        checkLogin: vi.fn(() => Promise.resolve()),
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

function message(overrides: Partial<TelegramMessage>): TelegramMessage {
    return {
        messageId: 7,
        chatId: ALLOWED_USER_ID,
        userId: ALLOWED_USER_ID,
        text: 'hello',
        ...overrides,
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

    it('ignores other commands', async () => {
        const { assistant, route } = setup();

        await route(message({ text: '/start' }));

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
