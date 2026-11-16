import {
    mkdir, readFile, writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';
import { installGracefulShutdown } from 'senaev-utils/src/utils/process/installGracefulShutdown';
import { answerTelegramCallbackQuery } from 'senaev-utils/src/utils/TelegramApi/answerTelegramCallbackQuery';
import { deleteTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/deleteTelegramMessage';
import { editTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/editTelegramMessage';
import { pollTelegramMessages } from 'senaev-utils/src/utils/TelegramApi/pollTelegramMessages';
import { sendTelegramEditableMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramEditableMessage';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { getAuthStatus, runCommand } from './claude';
import { logger } from './logger';
import {
    spawnClaudeLogin, spawnMcpLogin, startLogin,
} from './login';
import { createLoginAssistant } from './loginAssistant';
import {
    listMcpServers, logoutMcpServer, MCP_LOGIN_REJECTION_PATTERN,
} from './mcp';
import { createCallbackQueryRouter, createMessageRouter } from './messageRouter';

const LOGIN_CHECK_INTERVAL_MS = 10 * 60 * 1000;
// In the HOME that both containers share, next to the Claude Code state.
const MCP_NOTICES_PATH = join(homedir(), '.claude', 'telegram-login', 'mcp-notices.json');

async function readMcpNotices(): Promise<string[]> {
    try {
        const parsed: unknown = JSON.parse(await readFile(MCP_NOTICES_PATH, 'utf8'));

        return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : [];
    } catch (error) {
        // No file yet, or a broken one: at worst the notice comes once more.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.warn({ err: error }, '⚠️ Could not read the MCP notices, starting without them');
        }

        return [];
    }
}

async function writeMcpNotices(serverNames: string[]): Promise<void> {
    await mkdir(dirname(MCP_NOTICES_PATH), { recursive: true });
    await writeFile(MCP_NOTICES_PATH, JSON.stringify(serverNames));
}

const token = requireEnv('TELEGRAM_BOT_TOKEN');
const allowedUserId = Number(requireEnv('TELEGRAM_USER_ID'));

if (!Number.isSafeInteger(allowedUserId)) {
    throw new Error('TELEGRAM_USER_ID must be a number');
}

const assistant = createLoginAssistant({
    getAuthStatus: () => getAuthStatus(runCommand),
    startLogin: () => startLogin(spawnClaudeLogin),
    listMcpServers: () => listMcpServers(runCommand),
    // The CLI discovers the authorization server and may register a client before it prints the link.
    startMcpLogin: (serverName) => startLogin(() => spawnMcpLogin(serverName), {
        urlMs: 30_000,
        codeMs: 60_000,
    }, MCP_LOGIN_REJECTION_PATTERN),
    logoutMcpServer: (serverName) => logoutMcpServer(runCommand, serverName),
    readMcpNotices,
    writeMcpNotices,
    sendMarkdown: async (markdown, replyMarkup) => {
        await sendTelegramMessage({
            text: markdown,
            chatId: String(allowedUserId),
            token,
            disableLinkPreview: true,
            ...(replyMarkup !== undefined && { replyMarkup }),
        });
    },
    sendEditableMarkdown: (markdown, replyToMessageId) => {
        const message = sendTelegramEditableMessage({
            text: markdown,
            chatId: String(allowedUserId),
            token,
            disableLinkPreview: true,
            replyToMessageId,
            onSendError: (error) => logger.error(error, '❌ Could not send a Telegram message'),
        });

        return {
            edit: (editedMarkdown, replyMarkup) => message.edit({
                text: editedMarkdown,
                replyMarkup,
            }),
        };
    },
    editMarkdown: (messageId, markdown, replyMarkup) => editTelegramMessage({
        chatId: String(allowedUserId),
        messageId,
        text: markdown,
        token,
        disableLinkPreview: true,
        replyMarkup,
    }),
    now: () => new Date(),
});
const routerDependencies = {
    allowedUserId,
    assistant,
    deleteMessage: (chatId: number, messageId: number) => deleteTelegramMessage({
        token,
        chatId: String(chatId),
        messageId,
    }),
    answerCallbackQuery: (callbackQueryId: string, text: string) => answerTelegramCallbackQuery({
        token,
        callbackQueryId,
        text,
    }),
};
const routeMessage = createMessageRouter(routerDependencies);
const routeCallbackQuery = createCallbackQueryRouter(routerDependencies);

const lifecycle = installGracefulShutdown({
    stop: () => {
        assistant.stop();

        return Promise.resolve();
    },
    reportError: (error) => logger.error(error, '❌ Telegram login helper shutdown failed'),
});

// One step at a time: a login code must not be handled while a check still waits for its answer.
let queue: Promise<void> = Promise.resolve();

function enqueue(description: string, step: () => Promise<void>): Promise<void> {
    queue = queue.then(step).catch((error: unknown) => {
        logger.error(error, `❌ ${description} failed`);
    });

    return queue;
}

function main(): Promise<void> {
    logger.info('🚀 Telegram login helper started');
    const checkAll = () => {
        void enqueue('Checking the login', () => assistant.checkLogin());
        void enqueue('Checking the MCP servers', () => assistant.checkMcpServers());
    };

    checkAll();
    setInterval(checkAll, LOGIN_CHECK_INTERVAL_MS).unref();

    return pollTelegramMessages({
        token,
        signal: lifecycle.signal,
        skipMessagesSentBeforeStart: true,
        onMessage: (message) => enqueue('Handling a message', () => routeMessage(message)),
        onCallbackQuery: (callbackQuery) => enqueue('Handling a button press', () => routeCallbackQuery(callbackQuery)),
        onError: (error) => logger.error(error, '❌ Polling Telegram failed'),
    });
}

main().catch(async (error) => {
    if (!lifecycle.signal.aborted) {
        logger.error(error, '❌ Telegram login helper exited');
        await lifecycle.shutdown(1);
    }
});
