import { editTelegramMessage } from './editTelegramMessage';
import { sendTelegramMessage } from './sendTelegramMessage';
import { InlineKeyboardMarkup } from './types';

const PROGRESS_UPDATE_INTERVAL_MS = 10_000;

export interface TelegramProgressMessage {
    messageId: number;
    /**
     * Stops the refresh without writing anything.
     *
     * Call from a `finally` so that an unexpected error cannot leave the interval running
     * forever. Writing the outcome is still `finish`'s job.
     */
    stopRefresh: () => void;
    /**
     * Stops the refresh and writes the final text into the same message.
     *
     * Rejects if the write fails. Calling it more than once is allowed; the writes are
     * applied in call order, so the last caller wins.
     */
    finish: (parameters: {
        text: string;
        replyMarkup?: InlineKeyboardMarkup | undefined;
    }) => Promise<void>;
}

// A slow backend and a dead bot look the same to a user staring at a silent chat. This posts
// a message straight away and keeps a running second count in it, then `finish` replaces the
// count with the outcome, so one action leaves one message behind instead of a silent gap
// followed by a separate answer.
//
// buildText receives the seconds elapsed and must return ready MarkdownV2 -- escaping is
// the caller's business, because the text usually mixes escaped and formatted parts.
//
// onEditError reports a failed refresh. Refreshes run on an interval with no caller left to
// catch them, so a rejected one has nowhere else to go; it is deliberately not fatal,
// because a stale counter is better than losing the message altogether.
export async function startTelegramProgressMessage({
    buildText,
    chatId,
    token,
    replyToMessageId,
    onEditError,
}: {
    buildText: (elapsedSeconds: number) => string;
    chatId: string;
    token: string;
    replyToMessageId?: number | undefined;
    onEditError?: ((error: unknown) => void) | undefined;
}): Promise<TelegramProgressMessage> {
    const { message_id: messageId } = await sendTelegramMessage({
        token,
        chatId,
        parseMode: 'MarkdownV2',
        disableLinkPreview: true,
        text: buildText(0),
        ...(replyToMessageId !== undefined && { replyToMessageId }),
    });

    const startedAt = Date.now();

    // This message has more than one writer: the refresh below, the caller's `finish`, and
    // on the failure path a `finish` from further up the stack. Clearing the interval does
    // not recall a refresh that is already in flight, so without a single chain that refresh
    // could land after the final text and leave the message stuck on a stale count. Every
    // write goes through here, in the order it was requested.
    let writes: Promise<unknown> = Promise.resolve();
    let refreshStopped = false;

    function enqueueWrite(write: () => Promise<void>): Promise<void> {
        const result = writes.then(write);

        // The chain continues past a rejection, or one failed write would strand every write
        // queued behind it. The rejection still reaches whoever asked for this write.
        writes = result.catch(() => undefined);

        return result;
    }

    const timer = setInterval(() => {
        void enqueueWrite(async () => {
            // Dropped rather than sent: a refresh queued before the message was finished
            // would otherwise overwrite the outcome with a count.
            if (refreshStopped) {
                return;
            }

            await editTelegramMessage({
                chatId,
                messageId,
                token,
                parseMode: 'MarkdownV2',
                disableLinkPreview: true,
                // Read when the write runs, not when it was queued, so a wait behind another
                // write shows up as a larger count instead of a wrong one.
                text: buildText(Math.round((Date.now() - startedAt) / 1000)),
            });
        }).catch((error: unknown) => {
            onEditError?.(error);
        });
    }, PROGRESS_UPDATE_INTERVAL_MS);

    function stopRefresh(): void {
        refreshStopped = true;
        clearInterval(timer);
    }

    return {
        messageId,
        stopRefresh,
        finish: ({ text, replyMarkup }) => {
            stopRefresh();

            return enqueueWrite(() => editTelegramMessage({
                chatId,
                messageId,
                token,
                text,
                parseMode: 'MarkdownV2',
                disableLinkPreview: true,
                ...(replyMarkup && { replyMarkup }),
            }));
        },
    };
}
