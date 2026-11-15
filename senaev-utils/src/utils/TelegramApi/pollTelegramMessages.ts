import type { Milliseconds } from '../../types/Time/Milliseconds';
import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

import { callTelegramApi } from './callTelegramApi';
import type { TelegramMessage, TelegramUpdate } from './types';

const POLL_TIMEOUT_SECONDS = 50;
const RETRY_DELAY_MS: Milliseconds = 5_000;

type MessageBatch = {
    messages: TelegramMessage[];
    nextOffset: number | undefined;
};

async function getTelegramMessages({
    token,
    offset,
    timeoutSeconds,
}: {
    token: string;
    offset: number | undefined;
    timeoutSeconds: number;
}): Promise<MessageBatch> {
    const updates = await callTelegramApi<TelegramUpdate[]>({
        method: 'getUpdates',
        token,
        body: {
            offset,
            timeout: timeoutSeconds,
            allowed_updates: ['message'],
        },
    });
    const lastUpdate = updates.at(-1);

    return {
        messages: updates.flatMap(({ message }) => message === undefined ? [] : [message]),
        nextOffset: lastUpdate === undefined ? undefined : lastUpdate.update_id + 1,
    };
}

/**
 * Receives the messages of a bot with long polling (`getUpdates`), for a bot that has no webhook.
 * Never throws on its own: a failed poll is reported and retried after a delay. It returns when
 * `signal` is aborted, which is checked between polls, so it can take up to 50 seconds.
 *
 * The messages are handled one by one, in order. The offset moves on before a message is handled,
 * so a message that makes `onMessage` fail is reported and not repeated.
 */
export async function pollTelegramMessages({
    token,
    signal,
    onMessage,
    onError,
    skipMessagesSentBeforeStart = false,
}: {
    token: string;
    signal: AbortSignal;
    onMessage: (message: TelegramMessage) => Promise<void>;
    onError: (error: unknown) => void;
    skipMessagesSentBeforeStart?: boolean;
}): Promise<void> {
    let offset: number | undefined;

    if (skipMessagesSentBeforeStart) {
        // Offset -1 returns only the last waiting update; confirming it drops all the older ones.
        offset = (await getTelegramMessages({
            token,
            offset: -1,
            timeoutSeconds: 0,
        })).nextOffset;
    }

    while (!signal.aborted) {
        let batch: MessageBatch;

        try {
            batch = await getTelegramMessages({
                token,
                offset,
                timeoutSeconds: POLL_TIMEOUT_SECONDS,
            });
        } catch (error) {
            onError(error);
            await promiseTimeout(RETRY_DELAY_MS);

            continue;
        }

        offset = batch.nextOffset ?? offset;

        for (const message of batch.messages) {
            try {
                await onMessage(message);
            } catch (error) {
                onError(error);
            }
        }
    }
}
