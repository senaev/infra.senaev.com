import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { escapeHtml } from 'senaev-utils/src/utils/String/escapeHtml/escapeHtml';
import {
    telegramBold,
    telegramExpandableBlockquote,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramHtml/formatTelegramHtml';

import {
    OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT,
} from './env';
import { logger } from './logger';
import { HandleTrickyDadRequestResult } from './processAlisaCommand';
import { TRICKY_DAD_SOURCE_TO_CHAT_ID, TrickyDadSource } from './TrickyDadSource';

export async function sendTrickyDadReport({
    command,
    source,
    durationSeconds,
    result,
    replyToMessageId,
}: {
    command: string;
    source: TrickyDadSource;
    durationSeconds: string;
    result: HandleTrickyDadRequestResult;
    replyToMessageId?: number;
}): Promise<void> {
    const reportChatId = result.destination === 'grocery' ? TRICKY_DAD_CHAT_ID : OBSIDIAN_TASKS_CHAT_ID;

    const sourceChatId = TRICKY_DAD_SOURCE_TO_CHAT_ID[source];

    const shouldReply = sourceChatId && reportChatId === sourceChatId;

    const parts: string[] = [];

    if (result.addedItems) {
        // A `fallback` result is an unclassified command dumped into the grocery
        // list as-is, not a real shopping item — mark it ❌ so it is obvious in
        // the report that classification failed.
        const itemEmoji = result.destination === 'fallback' ? '❌' : '🛒';

        parts.push(result.addedItems.map((item) => `${itemEmoji} ${telegramBold(item)}`).join('\n'));
    }

    if (result.addedTasks) {
        parts.push(result.addedTasks.map((task) => `👉 ${telegramBold(task)}`).join('\n'));
    }

    // Raw values: telegramExpandableBlockquote escapes each line it is given, so escaping
    // here as well would show the escapes to the reader.
    const detailLines = [
        `🗣️ Команда: ${command}`,
        `📡 Откуда: ${source}`,
        `📍 Куда: ${{
            grocery: '🛒 grocery',
            task: '📌 task',
            fallback: '❌ fallback',
        }[result.destination]}`,
        `⏱️ Время: ${durationSeconds}s`,
        `🤖 Время OpenRouter: ${result.openRouterResponseTime}ms`,
        result.writeResponseTime !== null
            ? `🗄️ Время записи: ${result.writeResponseTime}ms`
            : null,
        result.openRouterError ? `❌ OpenRouter Error: ${String(result.openRouterError)}` : null,
        result.writeErrorString
            ? `❌ Write Error: ${result.writeErrorString}`
            : null,
    ].filter(Boolean) as string[];

    if (detailLines.length > 0) {
        parts.push(telegramExpandableBlockquote(detailLines));
    }

    const text = parts.join('\n');

    logger.info({
        reportChatId,
        source,
    }, '👉 Sending tricky dad report');

    await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: reportChatId,
        parseMode: 'HTML',
        text,
        ...(shouldReply && { replyToMessageId }),
    });

    const crossChat = sourceChatId && reportChatId !== sourceChatId;

    if (crossChat) {
        logger.info({
            sourceChatId,
            reportChatId,
        }, '👉 Sending cross-chat report');
        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: sourceChatId,
            parseMode: 'HTML',
            text,
            ...(replyToMessageId && { replyToMessageId }),
        });
    }
}

export async function sendTrickyDadErrorReport({
    command,
    err,
}: {
    command: string;
    err: unknown;
}): Promise<void> {
    logger.info('👉 Sending tricky dad error report');

    await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: OBSIDIAN_TASKS_CHAT_ID,
        parseMode: 'HTML',
        text: escapeHtml(`❌ Failed to process command=[${command}]: ${stringifyUnknownError(err)}`),
    });
}
