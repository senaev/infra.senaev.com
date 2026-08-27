import { editTelegramMessage } from './editTelegramMessage';
import { sendTelegramMessage } from './sendTelegramMessage';

const PROGRESS_UPDATE_INTERVAL_MS = 10_000;

export interface TelegramProgressMessage {
    messageId: number;
    stop: () => void;
}

// A slow backend and a dead bot look the same to a user staring at a silent chat. This posts
// a message straight away and keeps a running second count in it; the caller then edits the
// same message with the outcome, so one action leaves one message behind instead of a silent
// gap followed by a separate answer.
//
// buildText receives the seconds elapsed and must return ready MarkdownV2 -- escaping is
// the caller's business, because the text usually mixes escaped and formatted parts.
//
// onEditError reports a failed background refresh. The updates run on an interval with no
// caller left to catch them, so a rejected edit has nowhere else to go; it is deliberately
// not fatal, because a stale counter is better than losing the message altogether.
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
    const timer = setInterval(() => {
        void editTelegramMessage({
            chatId,
            messageId,
            token,
            parseMode: 'MarkdownV2',
            disableLinkPreview: true,
            text: buildText(Math.round((Date.now() - startedAt) / 1000)),
        }).catch((error: unknown) => {
            onEditError?.(error);
        });
    }, PROGRESS_UPDATE_INTERVAL_MS);

    return {
        messageId,
        stop: () => clearInterval(timer),
    };
}
