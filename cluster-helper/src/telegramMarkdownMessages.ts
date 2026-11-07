import { editTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/editTelegramMessage';
import {
    startTelegramProgressMessage,
    type TelegramProgressMessage,
} from 'senaev-utils/src/utils/TelegramApi/startTelegramProgressMessage';
import { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import { TG_TOKEN_SENAEV_COM_BOT } from './env';
import { logger } from './logger';

// Shared Rich Markdown Telegram helpers, with the service token and safe error logging.

export function editTelegramMarkdownMessage({
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
export function startTelegramMarkdownProgressMessage({
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
