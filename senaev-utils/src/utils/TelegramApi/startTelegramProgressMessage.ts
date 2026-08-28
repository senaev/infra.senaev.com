import { editTelegramMessage } from './editTelegramMessage';
import { sendTelegramMessage } from './sendTelegramMessage';
import { InlineKeyboardMarkup } from './types';

const PROGRESS_UPDATE_INTERVAL_MS = 10_000;

export interface TelegramProgressMessage {
    finish: (parameters: {
        text: string;
        replyMarkup?: InlineKeyboardMarkup | undefined;
    }) => Promise<void>;
}

export function startTelegramProgressMessage({
    buildText,
    chatId,
    token,
    replyToMessageId,
    onWriteError,
}: {
    buildText: (elapsedSeconds: number) => string;
    chatId: string;
    token: string;
    replyToMessageId?: number | undefined;
    onWriteError?: ((error: unknown) => void) | undefined;
}): TelegramProgressMessage {
    const startedAt = Date.now();

    let writes: Promise<unknown> = Promise.resolve();
    let refreshStopped = false;

    function enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
        const result = writes.then(write);

        writes = result.catch(() => undefined);

        return result;
    }

    const posting = enqueueWrite(async () => {
        const { message_id: messageId } = await sendTelegramMessage({
            token,
            chatId,
            parseMode: 'HTML',
            disableLinkPreview: true,
            text: buildText(0),
            ...(replyToMessageId !== undefined && { replyToMessageId }),
        });

        return messageId;
    });

    const timer = setInterval(() => {
        void enqueueWrite(async () => {
            if (refreshStopped) {
                return;
            }

            const messageId = await postedMessageId;

            if (messageId === undefined) {
                return;
            }

            await editTelegramMessage({
                chatId,
                messageId,
                token,
                parseMode: 'HTML',
                disableLinkPreview: true,
                text: buildText(Math.round((Date.now() - startedAt) / 1000)),
            });
        }).catch((error: unknown) => {
            onWriteError?.(error);
        });
    }, PROGRESS_UPDATE_INTERVAL_MS);

    function stopRefreshing(): void {
        refreshStopped = true;
        clearInterval(timer);
    }

    const postedMessageId: Promise<number | undefined> = posting.then(
        (messageId) => messageId,
        (error: unknown) => {
            stopRefreshing();
            onWriteError?.(error);

            return undefined;
        }
    );

    return {
        finish: ({ text, replyMarkup }) => {
            stopRefreshing();

            return enqueueWrite(async () => {
                const messageId = await postedMessageId;

                if (messageId === undefined) {
                    return;
                }

                await editTelegramMessage({
                    chatId,
                    messageId,
                    token,
                    text,
                    parseMode: 'HTML',
                    disableLinkPreview: true,
                    ...(replyMarkup && { replyMarkup }),
                });
            });
        },
    };
}
