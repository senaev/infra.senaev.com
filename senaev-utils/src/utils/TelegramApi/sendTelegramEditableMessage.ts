import { createTelegramRichMessage } from './createTelegramRichMessage';
import { editTelegramRichMessage } from './editTelegramRichMessage';
import { InlineKeyboardMarkup } from './types';

export interface TelegramEditableMessage {
    edit: (parameters: {
        text: string;
        replyMarkup?: InlineKeyboardMarkup | undefined;
    }) => Promise<void>;
}

/**
 * Posts an editable Rich Markdown message and returns a handle that owns subsequent edits.
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
    replyToMessageId,
    text,
    token,
}: {
    chatId: string;
    disableLinkPreview?: boolean | undefined;
    onSendError?: ((error: unknown) => void) | undefined;
    replyToMessageId?: number | undefined;
    text: string;
    token: string;
}): TelegramEditableMessage {
    const sentMessageId: Promise<number | undefined> = createTelegramRichMessage({
        chatId,
        token,
        markdown: text,
        media: [],
        ...(disableLinkPreview !== undefined && { disableLinkPreview }),
        ...(replyToMessageId !== undefined && { replyToMessageId }),
    }).catch((error: unknown) => {
        onSendError?.(error);

        return undefined;
    });

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
                    // Nothing to edit when the initial message could not be posted.
                    return;
                }

                await editTelegramRichMessage({
                    chatId,
                    messageId,
                    token,
                    markdown: editedText,
                    media: [],
                    ...(disableLinkPreview !== undefined && { disableLinkPreview }),
                    ...(replyMarkup && { replyMarkup }),
                });
            });

            writes = result.catch(() => undefined);

            return result;
        },
    };
}
