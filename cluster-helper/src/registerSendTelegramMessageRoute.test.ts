import Fastify from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { registerSendTelegramMessageRoute } from './registerSendTelegramMessageRoute';

const sendTelegramMessage = vi.hoisted(() => vi.fn());

vi.mock('senaev-utils/src/utils/TelegramApi/sendTelegramMessage', () => {
    return { sendTelegramMessage };
});
vi.mock('./env', () => {
    return { TG_TOKEN_SENAEV_COM_BOT: 'bot-token' };
});

let server: ReturnType<typeof Fastify>;

beforeEach(() => {
    sendTelegramMessage.mockReset();
    server = Fastify();
    registerSendTelegramMessageRoute(server);
});

afterEach(async () => {
    await server.close();
});

function send(body: Record<string, unknown>) {
    return server.inject({
        method: 'POST',
        url: '/telegram/send-message',
        payload: body,
    });
}

describe('/telegram/send-message', () => {
    it('sends the text unchanged by default', async () => {
        const response = await send({
            chatId: '42',
            text: 'See [[Job Requirements]]',
        });

        expect(response.statusCode).toBe(204);
        expect(sendTelegramMessage).toHaveBeenCalledExactlyOnceWith({
            chatId: '42',
            text: 'See [[Job Requirements]]',
            token: 'bot-token',
        });
    });

    it('turns wikilinks into highlights when asked, and does not pass preprocess on to Telegram', async () => {
        const response = await send({
            chatId: '42',
            text: 'See [[Job Requirements#Salary|the salary]] and [[Career opportunities in Nebius]]',
            preprocess: { wikiLinks: 'highlight' },
        });

        expect(response.statusCode).toBe(204);
        expect(sendTelegramMessage).toHaveBeenCalledExactlyOnceWith({
            chatId: '42',
            text: 'See ==the salary== and ==Career opportunities in Nebius==',
            token: 'bot-token',
        });
    });

    it('refuses an unknown preprocess.wikiLinks value and sends nothing', async () => {
        const response = await send({
            chatId: '42',
            text: '[[Note]]',
            preprocess: { wikiLinks: 'link' },
        });

        expect(response.statusCode).toBe(400);
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    it('refuses a preprocess that is not an object and sends nothing', async () => {
        const response = await send({
            chatId: '42',
            text: '[[Note]]',
            preprocess: 'highlight',
        });

        expect(response.statusCode).toBe(400);
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });
});
