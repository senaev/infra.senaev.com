import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { escapeHtml } from 'senaev-utils/src/utils/String/escapeHtml/escapeHtml';
import {
    telegramBold,
    telegramExpandableBlockquote,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramHtml/formatTelegramHtml';

import { OBSIDIAN_TASKS_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from '../env';
import { logger } from '../logger';

import type { TrickyDadCommandResult } from './runTrickyDadCommand';
import { TRICKY_DAD_SOURCES, type TrickyDadSource } from './TrickyDadSource';

export function isTrickyDadCommandFailed(result: TrickyDadCommandResult): boolean {
    return result.error !== null || result.actionResults.some(({ error }) => error !== null);
}

/**
 * The chats that get the report: the report chat of each action, and the source chat, so
 * the sender always sees the result. A fallback goes to the tasks chat, where failures are
 * watched.
 */
export function getTrickyDadReportChatIds(result: TrickyDadCommandResult, source: TrickyDadSource): string[] {
    const reportChatIds = result.isFallback
        ? [OBSIDIAN_TASKS_CHAT_ID]
        : result.actionResults.map(({ action }) => action.reportChatId);
    const { chatId: sourceChatId } = TRICKY_DAD_SOURCES[source];

    return [
        ...new Set([
            ...reportChatIds,
            ...sourceChatId ? [sourceChatId] : [],
        ]),
    ];
}

export function formatTrickyDadReport({
    command,
    source,
    durationSeconds,
    result,
}: {
    command: string;
    source: TrickyDadSource;
    durationSeconds: string;
    result: TrickyDadCommandResult;
}): string {
    const parts = result.actionResults.map(({ action, output }) => {
        // A fallback is an unclassified command saved as-is: ❌ shows that classification failed.
        const entryEmoji = result.isFallback ? '❌' : action.emoji;

        return [
            ...action.entries.map((entry) => `${entryEmoji} ${telegramBold(entry)}`),
            ...output.map((line) => escapeHtml(line)),
        ].join('\n');
    });

    const destination = result.actionResults
        .map(({ action }) => `${action.emoji} ${action.type}`)
        .join(', ');
    const llmAttempts = result.llmAttempts
        .map(({
            provider, durationMs, error,
        }) => `${provider} ${durationMs}ms ${error ? '❌' : '✅'}`)
        .join(' → ');

    // Raw values: telegramExpandableBlockquote escapes each line it is given, so escaping
    // here as well would show the escapes to the reader.
    const detailLines = [
        `🗣️ Команда: ${command}`,
        `📡 Откуда: ${source}`,
        `📍 Куда: ${result.isFallback ? '❌ fallback → ' : ''}${destination}`,
        `⏱️ Время: ${durationSeconds}s`,
        `🤖 LLM: ${llmAttempts || 'none'}`,
        ...result.actionResults.map(({ action, durationMs }) => `🗄️ ${action.type}: ${durationMs}ms`),
        ...result.llmAttempts.flatMap(({ provider, error }) => error ? [`❌ ${provider}: ${error}`] : []),
        ...result.error ? [result.error] : [],
        ...result.actionResults.flatMap(({ error }) => error ? [error] : []),
    ];

    return [
        ...parts,
        telegramExpandableBlockquote(detailLines),
    ].join('\n');
}

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
    result: TrickyDadCommandResult;
    replyToMessageId?: number;
}): Promise<void> {
    const { chatId: sourceChatId } = TRICKY_DAD_SOURCES[source];

    // A source without a Telegram chat (Alisa) already got its answer out loud, so a
    // successful command needs no Telegram confirmation. A failure is still reported,
    // because otherwise it would be lost entirely.
    if (!sourceChatId && !isTrickyDadCommandFailed(result)) {
        logger.info({ source }, '🔕 Skipping tricky dad report for a non-Telegram source');

        return;
    }

    const text = formatTrickyDadReport({
        command,
        source,
        durationSeconds,
        result,
    });

    for (const chatId of getTrickyDadReportChatIds(result, source)) {
        logger.info({
            chatId,
            source,
        }, '👉 Sending tricky dad report');

        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId,
            parseMode: 'HTML',
            text,
            ...(chatId === sourceChatId && replyToMessageId !== undefined && { replyToMessageId }),
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
