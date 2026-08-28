import { sendTelegramEditableMessage } from './sendTelegramEditableMessage';
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

    const message = sendTelegramEditableMessage({
        chatId,
        token,
        parseMode: 'HTML',
        disableLinkPreview: true,
        text: buildText(0),
        ...(replyToMessageId !== undefined && { replyToMessageId }),
        // Nothing is left to refresh if the message was never posted. This runs no earlier
        // than the next microtask, by which point the timer below exists.
        onSendError: (error) => {
            stopRefreshing();
            onWriteError?.(error);
        },
    });

    const timer = setInterval(() => {
        void message
            .edit({ text: buildText(Math.round((Date.now() - startedAt) / 1000)) })
            .catch((error: unknown) => {
                onWriteError?.(error);
            });
    }, PROGRESS_UPDATE_INTERVAL_MS);

    function stopRefreshing(): void {
        clearInterval(timer);
    }

    return {
        finish: ({ text, replyMarkup }) => {
            stopRefreshing();

            return message.edit({
                text,
                ...(replyMarkup && { replyMarkup }),
            });
        },
    };
}
