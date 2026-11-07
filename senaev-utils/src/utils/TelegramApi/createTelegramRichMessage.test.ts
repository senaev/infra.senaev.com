import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { createTelegramRichMessage } from './createTelegramRichMessage';

vi.mock('./callTelegramRichMessageMethod', () => {
    return { callTelegramRichMessageMethod: vi.fn() };
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callTelegramRichMessageMethod).mockResolvedValue({
        status: 'ok',
        result: { message_id: 42 },
    });
});

describe('createTelegramRichMessage', () => {
    it('always sends Rich Markdown, keeping replies, previews and media', async () => {
        const messageId = await createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            markdown: '**hello**',
            media: [],
            replyToMessageId: 7,
        });

        expect(messageId).toBe(42);
        expect(callTelegramRichMessageMethod).toHaveBeenCalledWith(expect.objectContaining({
            method: 'sendRichMessage',
            markdown: '**hello**',
            base: {
                chat_id: '123',
                reply_parameters: '{"message_id":7}',
            },
        }));
    });

    it('forwards oversized Markdown without splitting, preserving media, replies and buttons', async () => {
        const markdown = '🎬'.repeat(20_000);
        const media = [
            {
                id: 'photo',
                absolutePath: '/tmp/example.png',
            },
        ];
        const replyMarkup = {
            inline_keyboard: [
                [
                    {
                        text: 'More',
                        callback_data: 'next',
                    },
                ],
            ],
        };

        await expect(createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            markdown,
            media,
            replyToMessageId: 9,
            replyMarkup,
        })).resolves.toBe(42);

        expect(callTelegramRichMessageMethod).toHaveBeenCalledExactlyOnceWith({
            method: 'sendRichMessage',
            base: {
                chat_id: '123',
                reply_parameters: '{"message_id":9}',
                reply_markup: JSON.stringify(replyMarkup),
            },
            markdown,
            media,
            token: 'token',
            onRateLimited: undefined,
        });
    });

    it('propagates Telegram rejection for oversized messages without retrying or truncating', async () => {
        const telegramError = new Error('sendRichMessage failed: Bad Request: message is too long');

        vi.mocked(callTelegramRichMessageMethod).mockRejectedValueOnce(telegramError);

        await expect(createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            markdown: 'x'.repeat(70_000),
            media: [],
        })).rejects.toBe(telegramError);
        expect(callTelegramRichMessageMethod).toHaveBeenCalledTimes(1);
    });
});
