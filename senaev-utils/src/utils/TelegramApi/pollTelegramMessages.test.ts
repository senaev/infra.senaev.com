import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callTelegramApi } from './callTelegramApi';
import { pollTelegramMessages } from './pollTelegramMessages';
import type { TelegramMessage } from './types';

vi.mock('./callTelegramApi', () => {
    return { callTelegramApi: vi.fn() };
});

const callTelegramApiMock = vi.mocked(callTelegramApi);

const TOKEN = '123456:secret-token';

function message(messageId: number): TelegramMessage {
    return {
        message_id: messageId,
        chat: {
            id: 42,
            type: 'private',
        },
        date: 0,
        text: `text ${messageId}`,
    };
}

function polledOffsets(): unknown[] {
    return callTelegramApiMock.mock.calls.map(([{ body }]) => body?.['offset']);
}

function setup() {
    const controller = new AbortController();
    const handled: number[] = [];
    const errors: unknown[] = [];
    const run = (options: { skipMessagesSentBeforeStart?: boolean; onMessage?: (message: TelegramMessage) => Promise<void> } = {}) => pollTelegramMessages({
        token: TOKEN,
        signal: controller.signal,
        onMessage: options.onMessage ?? ((received) => {
            handled.push(received.message_id);

            return Promise.resolve();
        }),
        onError: (error) => errors.push(error),
        ...options.skipMessagesSentBeforeStart === undefined ? {} : { skipMessagesSentBeforeStart: options.skipMessagesSentBeforeStart },
    });

    return {
        controller,
        handled,
        errors,
        run,
    };
}

describe('pollTelegramMessages', () => {
    beforeEach(() => {
        callTelegramApiMock.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('handles the messages in order and asks for the next ones after the last update', async () => {
        const {
            controller, handled, run,
        } = setup();

        callTelegramApiMock
            .mockResolvedValueOnce([
                {
                    update_id: 10,
                    message: message(1),
                },
                { update_id: 11 },
                {
                    update_id: 12,
                    message: message(2),
                },
            ])
            .mockImplementationOnce(() => {
                controller.abort();

                return Promise.resolve([]);
            });

        await run();

        expect(handled).toEqual([
            1,
            2,
        ]);
        expect(polledOffsets()).toEqual([
            undefined,
            13,
        ]);
        expect(callTelegramApiMock.mock.calls[0]?.[0]).toEqual({
            method: 'getUpdates',
            token: TOKEN,
            body: {
                offset: undefined,
                timeout: 50,
                allowed_updates: ['message'],
            },
        });
    });

    it('keeps the offset when a poll brings no update', async () => {
        const { controller, run } = setup();

        callTelegramApiMock
            .mockResolvedValueOnce([
                {
                    update_id: 5,
                    message: message(1),
                },
            ])
            .mockResolvedValueOnce([])
            .mockImplementationOnce(() => {
                controller.abort();

                return Promise.resolve([]);
            });

        await run();

        expect(polledOffsets()).toEqual([
            undefined,
            6,
            6,
        ]);
    });

    it('can skip the messages that came before the start', async () => {
        const {
            controller, handled, run,
        } = setup();

        callTelegramApiMock
            .mockResolvedValueOnce([
                {
                    update_id: 99,
                    message: message(1),
                },
            ])
            .mockImplementationOnce(() => {
                controller.abort();

                return Promise.resolve([
                    {
                        update_id: 100,
                        message: message(2),
                    },
                ]);
            });

        await run({ skipMessagesSentBeforeStart: true });

        expect(polledOffsets()).toEqual([
            -1,
            100,
        ]);
        expect(callTelegramApiMock.mock.calls[0]?.[0].body?.['timeout']).toBe(0);
        expect(handled).toEqual([2]);
    });

    it('tries the first request again after a failure, before it starts to skip', async () => {
        vi.useFakeTimers();
        const {
            controller, errors, handled, run,
        } = setup();
        const failure = new Error('network down');

        callTelegramApiMock
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce([
                {
                    update_id: 99,
                    message: message(1),
                },
            ])
            .mockImplementationOnce(() => {
                controller.abort();

                return Promise.resolve([
                    {
                        update_id: 100,
                        message: message(2),
                    },
                ]);
            });

        const running = run({ skipMessagesSentBeforeStart: true });

        await vi.advanceTimersByTimeAsync(5000);
        await running;

        expect(errors).toEqual([failure]);
        expect(polledOffsets()).toEqual([
            -1,
            -1,
            100,
        ]);
        expect(handled).toEqual([2]);
    });

    it('reports a failed poll and tries again after the delay', async () => {
        vi.useFakeTimers();
        const {
            controller, errors, handled, run,
        } = setup();
        const failure = new Error('network down');

        callTelegramApiMock
            .mockRejectedValueOnce(failure)
            .mockImplementationOnce(() => {
                controller.abort();

                return Promise.resolve([
                    {
                        update_id: 1,
                        message: message(7),
                    },
                ]);
            });

        const running = run();

        await vi.advanceTimersByTimeAsync(4999);
        expect(callTelegramApiMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await running;

        expect(errors).toEqual([failure]);
        expect(handled).toEqual([7]);
    });

    it('reports a failing handler, does not repeat the message and goes on', async () => {
        const {
            controller, errors, run,
        } = setup();
        const failure = new Error('handler failed');
        const onMessage = vi.fn((received: TelegramMessage) => received.message_id === 1 ? Promise.reject(failure) : Promise.resolve());

        callTelegramApiMock
            .mockResolvedValueOnce([
                {
                    update_id: 10,
                    message: message(1),
                },
                {
                    update_id: 11,
                    message: message(2),
                },
            ])
            .mockImplementationOnce(() => {
                controller.abort();

                return Promise.resolve([]);
            });

        await run({ onMessage });

        expect(errors).toEqual([failure]);
        expect(onMessage).toHaveBeenCalledTimes(2);
        expect(polledOffsets()).toEqual([
            undefined,
            12,
        ]);
    });

    it('does not poll when it is stopped already', async () => {
        const { controller, run } = setup();

        controller.abort();
        await run();

        expect(callTelegramApiMock).not.toHaveBeenCalled();
    });
});
