import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { createTelegramRichMessage } from './createTelegramRichMessage';
import { TELEGRAM_RICH_MESSAGE_MAX_LENGTH } from './splitTelegramMarkdown/splitTelegramMarkdown';

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

    it('splits long Markdown, only replying and attaching media on the first part', async () => {
        const firstId = await createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            markdown: '🎬'.repeat(20_000),
            media: [
                {
                    id: 'photo',
                    absolutePath: '/tmp/example.png',
                },
            ],
            replyToMessageId: 9,
        });
        const calls = vi.mocked(callTelegramRichMessageMethod).mock.calls.map(([args]) => args);

        expect(firstId).toBe(42);
        expect(calls.length).toBeGreaterThan(1);
        expect(calls.every((call) => Buffer.byteLength(call.markdown ?? '') <= TELEGRAM_RICH_MESSAGE_MAX_LENGTH)).toBe(true);
        expect(calls.slice(1).every((call) => !('reply_parameters' in call.base) && call.media.length === 0)).toBe(true);
        expect(calls.map((call) => call.markdown).join('')).toBe('🎬'.repeat(20_000));
    });

    it('attaches inline keyboards only to the final rich-message part', async () => {
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

        await createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            markdown: 'a'.repeat(70_000),
            media: [],
            replyMarkup,
        });
        const calls = vi.mocked(callTelegramRichMessageMethod).mock.calls.map(([args]) => args);

        expect(calls.length).toBeGreaterThan(1);
        expect(calls.slice(0, -1).every(({ base }) => !('reply_markup' in base))).toBe(true);
        expect(calls.at(-1)?.base.reply_markup).toBe(JSON.stringify(replyMarkup));
    });
});
