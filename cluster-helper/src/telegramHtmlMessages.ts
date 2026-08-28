import { editTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/editTelegramMessage';
import {
    startTelegramProgressMessage,
    type TelegramProgressMessage,
} from 'senaev-utils/src/utils/TelegramApi/startTelegramProgressMessage';
import { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import { TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';

// Binds this service's bot token and its message conventions -- every message it writes is
// HTML with link previews off -- so that neither is repeated at each call site and cannot
// drift between them. All Telegram behaviour itself lives in senaev-utils.
//
// HTML rather than MarkdownV2 because the two express exactly the same entities, so the only
// thing left to choose between them is the escaping: three characters instead of eighteen,
// one rule everywhere instead of a second one inside code, and a cut through an escape that
// degrades to literal text instead of a rejected message.

export function editTelegramHtmlMessage({
    chatId,
    messageId,
    replyMarkup,
    text,
}: {
    chatId: number | string;
    messageId: number;
    replyMarkup?: InlineKeyboardMarkup | undefined;
    text: string;
}): Promise<void> {
    return editTelegramMessage({
        chatId,
        messageId,
        replyMarkup,
        text,
        token: TG_TOKEN_SENAEV_COM_BOT,
        parseMode: 'HTML',
        disableLinkPreview: true,
    });
}

/**
 * Posts a progress message that owns every later write to itself.
 *
 * Use the returned handle rather than editing its message id directly: the refresh and the
 * final text share one write chain, and a write made around it can land out of order and
 * leave the message stuck on a stale count.
 */
export function startTelegramHtmlProgressMessage({
    buildText,
    chatId,
    replyToMessageId,
}: {
    buildText: (elapsedSeconds: number) => string;
    chatId: string;
    replyToMessageId?: number | undefined;
}): TelegramProgressMessage {
    return startTelegramProgressMessage({
        buildText,
        chatId,
        replyToMessageId,
        token: TG_TOKEN_SENAEV_COM_BOT,
        onWriteError: (error) => {
            logger.warn({ err: error }, '⚠️ Failed to write a Telegram progress message');
        },
    });
}
