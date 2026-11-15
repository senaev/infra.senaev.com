import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { deleteTelegramMessage, getTelegramMessages } from './telegram';

const TOKEN = '123456:secret-token';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function stubFetch(...responses: Response[]) {
    const calls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
        calls.push({
            url: String(url),
            body: JSON.parse(String(init?.body)),
        });

        return Promise.resolve(responses.shift() ?? jsonResponse({
            ok: true,
            result: true,
        }));
    });

    vi.stubGlobal('fetch', fetchMock);

    return calls;
}

const MESSAGE = {
    message_id: 5,
    chat: { id: 42 },
    from: { id: 42 },
    text: '/auth',
};

describe('Telegram messages', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('gets the messages and says where the next batch starts', async () => {
        const calls = stubFetch(jsonResponse({
            ok: true,
            result: [
                {
                    update_id: 10,
                    message: MESSAGE,
                },
                { update_id: 11 },
            ],
        }));

        const batch = await getTelegramMessages({
            token: TOKEN,
            offset: 7,
            timeoutSeconds: 50,
        });

        expect(batch.messages).toEqual([MESSAGE]);
        expect(batch.nextOffset).toBe(12);
        expect(calls[0]).toEqual({
            url: `https://api.telegram.org/bot${TOKEN}/getUpdates`,
            body: {
                offset: 7,
                timeout: 50,
                allowed_updates: ['message'],
            },
        });
    });

    it('keeps the offset open when there is no update', async () => {
        stubFetch(jsonResponse({
            ok: true,
            result: [],
        }));

        await expect(getTelegramMessages({
            token: TOKEN,
            offset: undefined,
            timeoutSeconds: 0,
        })).resolves.toEqual({
            messages: [],
            nextOffset: undefined,
        });
    });

    it('deletes a message', async () => {
        const calls = stubFetch();

        await deleteTelegramMessage({
            token: TOKEN,
            chatId: 42,
            messageId: 5,
        });

        expect(calls[0]?.body).toEqual({
            chat_id: 42,
            message_id: 5,
        });
        expect(calls[0]?.url).toBe(`https://api.telegram.org/bot${TOKEN}/deleteMessage`);
    });

    it('fails without the token in the message', async () => {
        stubFetch(jsonResponse({
            ok: false,
            description: 'Unauthorized',
        }, 401));

        const failure = getTelegramMessages({
            token: TOKEN,
            offset: undefined,
            timeoutSeconds: 0,
        });

        await expect(failure).rejects.toThrow('Telegram getUpdates HTTP 401');
        await expect(failure).rejects.not.toThrow(TOKEN);
    });
});
