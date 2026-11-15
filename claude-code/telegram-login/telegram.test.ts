import {
    describe, expect, it, vi,
} from 'vitest';

import { createTelegramClient, parseMessage } from './telegram.ts';

const TOKEN = '123456:secret-token';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function createFetch(...responses: Response[]) {
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

    return {
        fetchMock: fetchMock as unknown as typeof fetch,
        calls,
    };
}

const TEXT_UPDATE = {
    update_id: 10,
    message: {
        message_id: 5,
        chat: { id: 42 },
        from: { id: 42 },
        text: '/auth',
    },
};

describe('parseMessage', () => {
    it('reads the ids and the text of a text message', () => {
        expect(parseMessage(TEXT_UPDATE)).toEqual({
            messageId: 5,
            chatId: 42,
            userId: 42,
            text: '/auth',
        });
    });

    it('skips updates without a text message', () => {
        expect(parseMessage({ update_id: 1 })).toBeNull();
        expect(parseMessage({
            message: {
                ...TEXT_UPDATE.message,
                text: undefined,
            },
        })).toBeNull();
        expect(parseMessage({
            message: {
                ...TEXT_UPDATE.message,
                from: undefined,
            },
        })).toBeNull();
        expect(parseMessage(null)).toBeNull();
    });
});

describe('the Telegram client', () => {
    it('gets the messages and says where the next batch starts', async () => {
        const { fetchMock, calls } = createFetch(jsonResponse({
            ok: true,
            result: [
                TEXT_UPDATE,
                { update_id: 11 },
            ],
        }));

        const batch = await createTelegramClient(TOKEN, fetchMock).getMessages(7, 50);

        expect(batch.messages).toHaveLength(1);
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
        const { fetchMock } = createFetch(jsonResponse({
            ok: true,
            result: [],
        }));

        await expect(createTelegramClient(TOKEN, fetchMock).getMessages(undefined, 0)).resolves.toEqual({
            messages: [],
            nextOffset: undefined,
        });
    });

    it('sends and deletes messages', async () => {
        const { fetchMock, calls } = createFetch();
        const client = createTelegramClient(TOKEN, fetchMock);

        await client.sendMessage(42, 'hello');
        await client.deleteMessage(42, 5);

        expect(calls.map((call) => call.body)).toEqual([
            {
                chat_id: 42,
                text: 'hello',
                link_preview_options: { is_disabled: true },
            },
            {
                chat_id: 42,
                message_id: 5,
            },
        ]);
    });

    it('fails without the token in the message', async () => {
        const { fetchMock } = createFetch(jsonResponse({
            ok: false,
            description: 'Unauthorized',
        }, 401));

        const failure = createTelegramClient(TOKEN, fetchMock).sendMessage(42, 'hello');

        await expect(failure).rejects.toThrow('Telegram sendMessage failed with HTTP 401');
        await expect(failure).rejects.not.toThrow(TOKEN);
    });
});
