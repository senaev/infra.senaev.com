import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callTelegramApi } from './callTelegramApi';
import { deleteTelegramMessage } from './deleteTelegramMessage';

vi.mock('./callTelegramApi', () => {
    return { callTelegramApi: vi.fn() };
});

describe('deleteTelegramMessage', () => {
    beforeEach(() => {
        vi.mocked(callTelegramApi).mockReset();
    });

    it('calls deleteMessage for the chat and the message', async () => {
        await deleteTelegramMessage({
            token: 'token',
            chatId: 42,
            messageId: 5,
        });

        expect(callTelegramApi).toHaveBeenCalledWith({
            method: 'deleteMessage',
            token: 'token',
            body: {
                chat_id: 42,
                message_id: 5,
            },
        });
    });
});
