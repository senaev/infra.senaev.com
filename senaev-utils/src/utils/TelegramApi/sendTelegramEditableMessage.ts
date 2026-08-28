import { editTelegramMessage } from './editTelegramMessage';
import { sendTelegramMessage } from './sendTelegramMessage';
import { InlineKeyboardMarkup, TelegramParseMode } from './types';

export interface TelegramEditableMessage {
    edit: (parameters: {
        text: string;
        replyMarkup?: InlineKeyboardMarkup | undefined;
    }) => Promise<void>;
}

/**
 * Posts a message and hands back a handle that can rewrite it, hiding its id.
 *
 * Returns synchronously, while the message is still being posted: every later write waits
 * for the id on its own, so a caller never has to hold one or await the send.
 *
 * Writes are serialized, and only the newest waiting write survives -- queue two while a
 * third is in flight and the older one is dropped. Both rules exist because the message has
 * one visible state: concurrent writes could otherwise land out of order and leave stale text
 * on screen, and an intermediate state nobody has seen yet is not worth an API call.
 */
export function sendTelegramEditableMessage({
    chatId,
    disableLinkPreview,
    onSendError,
    parseMode,
    replyToMessageId,
    text,
    token,
}: {
    chatId: string;
    disableLinkPreview?: boolean | undefined;
    onSendError?: ((error: unknown) => void) | undefined;
    parseMode?: TelegramParseMode | undefined;
    replyToMessageId?: number | undefined;
    text: string;
    token: string;
}): TelegramEditableMessage {
    const sentMessageId: Promise<number | undefined> = sendTelegramMessage({
        chatId,
        text,
        token,
        ...(parseMode !== undefined && { parseMode }),
        ...(disableLinkPreview !== undefined && { disableLinkPreview }),
        ...(replyToMessageId !== undefined && { replyToMessageId }),
    }).then(
        ({ message_id: messageId }) => messageId,
        (error: unknown) => {
            onSendError?.(error);

            return undefined;
        }
    );

    let writes: Promise<unknown> = Promise.resolve();
    let newestQueuedWrite = 0;

    return {
        edit: ({ text: editedText, replyMarkup }) => {
            const thisWrite = ++newestQueuedWrite;

            const result = writes.then(async () => {
                if (thisWrite !== newestQueuedWrite) {
                    return;
                }

                const messageId = await sentMessageId;

                if (messageId === undefined) {
                    // TODO: decide what a caller should be able to do about a message that was
                    // never posted. For now the write is dropped, as the only caller wants.
                    return;
                }

                await editTelegramMessage({
                    chatId,
                    messageId,
                    token,
                    text: editedText,
                    ...(parseMode !== undefined && { parseMode }),
                    ...(disableLinkPreview !== undefined && { disableLinkPreview }),
                    ...(replyMarkup && { replyMarkup }),
                });
            });

            writes = result.catch(() => undefined);

            return result;
        },
    };
}
