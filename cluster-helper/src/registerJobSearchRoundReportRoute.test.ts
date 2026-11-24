import Fastify from 'fastify';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { registerJobSearchRoundReportRoute } from './registerJobSearchRoundReportRoute';

vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
        },
    };
});

const sendTelegramMessage = vi.fn<(text: string) => Promise<unknown>>();
const addToRecommendationsLog = vi.fn<(report: { date: string; time: string; text: string }) => Promise<void>>();

let server: ReturnType<typeof Fastify>;

const report = {
    date: '2026-11-25',
    time: '04:00',
    text: '**Job search round, 2026-11-25**\n\nSee [[Career opportunities in Nebius]]',
};

beforeEach(() => {
    sendTelegramMessage.mockReset().mockResolvedValue({ message_id: 1 });
    addToRecommendationsLog.mockReset().mockResolvedValue(undefined);
    server = Fastify();
    registerJobSearchRoundReportRoute(server, {
        sendTelegramMessage,
        addToRecommendationsLog,
    });
});

afterEach(async () => {
    await server.close();
});

function post(body: unknown) {
    return server.inject({
        method: 'POST',
        url: '/job-search/round-report',
        payload: body as Record<string, unknown>,
    });
}

describe('POST /job-search/round-report', () => {
    it('sends the message with links turned into highlights and logs the text with links unchanged', async () => {
        const response = await post(report);

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
        expect(sendTelegramMessage).toHaveBeenCalledExactlyOnceWith('**Job search round, 2026-11-25**\n\nSee ==Career opportunities in Nebius==');
        expect(addToRecommendationsLog).toHaveBeenCalledExactlyOnceWith(report);
    });

    it('starts both deliveries without waiting for the other', async () => {
        const telegram = Promise.withResolvers<unknown>();

        sendTelegramMessage.mockReturnValue(telegram.promise);

        const pending = post(report);

        await vi.waitFor(() => {
            expect(addToRecommendationsLog).toHaveBeenCalledOnce();
        });
        expect(sendTelegramMessage).toHaveBeenCalledOnce();

        telegram.resolve({ message_id: 1 });
        expect((await pending).statusCode).toBe(200);
    });

    it('still sends the message when the log write fails, and answers 502 with the failed target', async () => {
        addToRecommendationsLog.mockRejectedValue(new Error('obsidian-sync is down'));

        const response = await post(report);

        expect(response.statusCode).toBe(502);
        expect(response.json()).toEqual({
            status: 'error',
            message: 'LLM Recommendations Log: obsidian-sync is down',
        });
        expect(sendTelegramMessage).toHaveBeenCalledOnce();
    });

    it('still writes the log when Telegram fails', async () => {
        sendTelegramMessage.mockRejectedValue(new Error('Telegram answered 500'));

        const response = await post(report);

        expect(response.statusCode).toBe(502);
        expect(response.json()).toEqual({
            status: 'error',
            message: 'Telegram: Telegram answered 500',
        });
        expect(addToRecommendationsLog).toHaveBeenCalledExactlyOnceWith(report);
    });

    it('names both targets when both fail', async () => {
        sendTelegramMessage.mockRejectedValue(new Error('a'));
        addToRecommendationsLog.mockRejectedValue(new Error('b'));

        const response = await post(report);

        expect(response.statusCode).toBe(502);
        expect(response.json()).toEqual({
            status: 'error',
            message: 'Telegram: a; LLM Recommendations Log: b',
        });
    });

    it('refuses a body without date, time and text, and delivers nothing', async () => {
        const response = await post({
            date: '2026-11-25',
            text: 'no time',
        });

        expect(response.statusCode).toBe(400);
        expect(sendTelegramMessage).not.toHaveBeenCalled();
        expect(addToRecommendationsLog).not.toHaveBeenCalled();
    });
});
