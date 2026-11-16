import type { Milliseconds } from '../../types/Time/Milliseconds';
import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

import { callTelegramApi } from './callTelegramApi';
import type {
    TelegramCallbackQuery, TelegramMessage, TelegramUpdate,
} from './types';

const POLL_TIMEOUT_SECONDS = 50;
const RETRY_DELAY_MS: Milliseconds = 5_000;

type UpdateBatch = {
    updates: TelegramUpdate[];
    nextOffset: number | undefined;
};

async function getTelegramUpdates({
    token,
    offset,
    timeoutSeconds,
    allowedUpdates,
}: {
    token: string;
    offset: number | undefined;
    timeoutSeconds: number;
    allowedUpdates: string[];
}): Promise<UpdateBatch> {
    const updates = await callTelegramApi<TelegramUpdate[]>({
        method: 'getUpdates',
        token,
        body: {
            offset,
            timeout: timeoutSeconds,
            allowed_updates: allowedUpdates,
        },
    });
    const lastUpdate = updates.at(-1);

    return {
        updates,
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
 *
 * With `onCallbackQuery`, the presses of inline keyboard buttons come too, in the same order and
 * the same way. The handler must answer them with `answerTelegramCallbackQuery`.
 */
export async function pollTelegramMessages({
    token,
    signal,
    onMessage,
    onCallbackQuery,
    onError,
    skipMessagesSentBeforeStart = false,
}: {
    token: string;
    signal: AbortSignal;
    onMessage: (message: TelegramMessage) => Promise<void>;
    onCallbackQuery?: (callbackQuery: TelegramCallbackQuery) => Promise<void>;
    onError: (error: unknown) => void;
    skipMessagesSentBeforeStart?: boolean;
}): Promise<void> {
    const allowedUpdates = onCallbackQuery === undefined
        ? ['message']
        : [
            'message',
            'callback_query',
        ];
    let offset: number | undefined;
    let isOffsetReady = !skipMessagesSentBeforeStart;

    while (!isOffsetReady && !signal.aborted) {
        try {
            // Offset -1 returns only the last waiting update; confirming it drops all the older ones.
            offset = (await getTelegramUpdates({
                token,
                offset: -1,
                timeoutSeconds: 0,
                allowedUpdates,
            })).nextOffset;
            isOffsetReady = true;
        } catch (error) {
            onError(error);
            await promiseTimeout(RETRY_DELAY_MS);
        }
    }

    while (!signal.aborted) {
        let batch: UpdateBatch;

        try {
            batch = await getTelegramUpdates({
                token,
                offset,
                timeoutSeconds: POLL_TIMEOUT_SECONDS,
                allowedUpdates,
            });
        } catch (error) {
            onError(error);
            await promiseTimeout(RETRY_DELAY_MS);

            continue;
        }

        offset = batch.nextOffset ?? offset;

        for (const { message, callback_query: callbackQuery } of batch.updates) {
            try {
                if (message !== undefined) {
                    await onMessage(message);
                } else if (callbackQuery !== undefined) {
                    await onCallbackQuery?.(callbackQuery);
                }
            } catch (error) {
                onError(error);
            }
        }
    }
}
