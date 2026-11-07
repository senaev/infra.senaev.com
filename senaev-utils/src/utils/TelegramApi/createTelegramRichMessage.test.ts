import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callTelegramRichMessageMethod } from './callTelegramRichMessageMethod';
import { createTelegramRichMessage } from './createTelegramRichMessage';
import { TELEGRAM_RICH_MESSAGE_MAX_LENGTH } from './splitTelegramHtml/splitTelegramHtml';

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
    it('sends short HTML as one rich message', async () => {
        const messageId = await createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            html: '<b>hello</b>',
            media: [],
            replyToMessageId: 7,
        });

        expect(messageId).toBe(42);
        expect(callTelegramRichMessageMethod).toHaveBeenCalledWith(expect.objectContaining({
            method: 'sendRichMessage',
            html: '<b>hello</b>',
            base: {
                chat_id: '123',
                reply_parameters: '{"message_id":7}',
            },
        }));
    });

    it('splits large HTML safely, preserving every character and only replying on the first part', async () => {
        const html = `<pre>${'🎬&amp;'.repeat(7500)}</pre>`;
        const firstId = await createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            html,
            media: [],
            replyToMessageId: 9,
        });
        const calls = vi.mocked(callTelegramRichMessageMethod).mock.calls.map(([arg]) => arg);

        expect(firstId).toBe(42);
        expect(calls.length).toBeGreaterThan(1);
        expect(calls.every((call) => Buffer.byteLength(call.html ?? '') <= TELEGRAM_RICH_MESSAGE_MAX_LENGTH)).toBe(true);
        expect(calls.slice(1).every((call) => !('reply_parameters' in call.base))).toBe(true);
        expect(calls.map((call) => call.html!.replaceAll(/<\/?pre>/gu, '')).join(''))
            .toBe(html.replaceAll(/<\/?pre>/gu, ''));
    });

    it('puts inline keyboards only on the last rich-message part', async () => {
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
            html: `<pre>${'a'.repeat(70_000)}</pre>`,
            media: [],
            replyMarkup,
        });

        const calls = vi.mocked(callTelegramRichMessageMethod).mock.calls.map(([args]) => args);

        expect(calls.length).toBeGreaterThan(1);
        expect(calls.slice(0, -1).every(({ base }) => !('reply_markup' in base))).toBe(true);
        expect(calls.at(-1)?.base.reply_markup).toBe(JSON.stringify(replyMarkup));
    });

    it('preserves existing Markdown publishing', async () => {
        await createTelegramRichMessage({
            token: 'token',
            chatId: '123',
            markdown: '**Title**',
            media: [],
        });
        expect(callTelegramRichMessageMethod).toHaveBeenCalledWith(expect.objectContaining({ markdown: '**Title**' }));
    });
});
