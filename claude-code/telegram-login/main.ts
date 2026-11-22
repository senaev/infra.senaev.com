import {
    mkdir, readFile, writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';
import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';
import { answerTelegramCallbackQuery } from 'senaev-utils/src/utils/TelegramApi/answerTelegramCallbackQuery';
import { deleteTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/deleteTelegramMessage';
import { editTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/editTelegramMessage';
import { pollTelegramMessages } from 'senaev-utils/src/utils/TelegramApi/pollTelegramMessages';
import { sendTelegramEditableMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramEditableMessage';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import {
    getAuthStatus, logoutClaude, runCommand,
} from './claude';
import {
    isCodexLoggedIn, logoutCodex, readLastConnectionError, spawnCodexDeviceLogin, startCodexDeviceLogin, startCodexPairing,
} from './codex';
import { type CodexLogin, createCodexLogin } from './codexLogin';
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
    logout: () => logoutClaude(runCommand),
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
        let sendFailed = false;
        const message = sendTelegramEditableMessage({
            text: markdown,
            chatId: String(allowedUserId),
            token,
            disableLinkPreview: true,
            replyToMessageId,
            onSendError: (error) => {
                sendFailed = true;
                logger.error(error, '❌ Could not send a Telegram message');
            },
        });

        return {
            // An edit waits for the first send; when that failed, there is nothing to edit, and
            // the caller must know that the user saw nothing.
            edit: async (editedMarkdown, replyMarkup) => {
                await message.edit({
                    text: editedMarkdown,
                    replyMarkup,
                });

                if (sendFailed) {
                    throw new Error('The Telegram message could not be sent');
                }
            },
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
// The Codex login folder is mounted, and CODEX_HOME set, only when the workspace enables Codex.
const codexHome = process.env.CODEX_HOME;
const codexLogin: CodexLogin | undefined = codexHome === undefined
    ? undefined
    : createCodexLogin({
        isLoggedIn: () => isCodexLoggedIn(runCommand),
        startLogin: () => startCodexDeviceLogin(spawnCodexDeviceLogin),
        logout: () => logoutCodex(runCommand),
        startPairing: () => startCodexPairing(runCommand),
        readLastConnectionError: () => readLastConnectionError(codexHome),
        sendMarkdown: async (markdown, replyMarkup) => {
            await sendTelegramMessage({
                text: markdown,
                chatId: String(allowedUserId),
                token,
                disableLinkPreview: true,
                ...(replyMarkup !== undefined && { replyMarkup }),
            });
        },
        editMarkdown: async (messageId, markdown, replyMarkup) => {
            await editTelegramMessage({
                chatId: String(allowedUserId),
                messageId,
                text: markdown,
                token,
                disableLinkPreview: true,
                replyMarkup,
            });
        },
    });
const routerDependencies = {
    allowedUserId,
    assistant,
    ...(codexLogin !== undefined && { codexLogin }),
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

const polling = new AbortController();
const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ Telegram login helper shutdown failed')
);

function stop(): void {
    polling.abort(new Error('Service stopping'));
    assistant.stop();
    codexLogin?.stop();
}

subscribeShutdown(stop);

// One step at a time: a login code must not be handled while a check still waits for its answer.
let queue: Promise<void> = Promise.resolve();

function enqueue(description: string, step: () => Promise<void>): Promise<void> {
    queue = queue.then(step).catch((error: unknown) => {
        logger.error(error, `❌ ${description} failed`);
    });

    return queue;
}

function main(): Promise<void> {
    logger.info({ codex: codexLogin !== undefined }, '🚀 Telegram login helper started');
    const checkAll = () => {
        void enqueue('Checking the login', () => assistant.checkLogin());
        void enqueue('Checking the MCP servers', () => assistant.checkMcpServers());

        if (codexLogin !== undefined) {
            void enqueue('Checking the Codex login', () => codexLogin.checkLogin());
        }
    };

    checkAll();
    setInterval(checkAll, LOGIN_CHECK_INTERVAL_MS).unref();

    return pollTelegramMessages({
        token,
        signal: polling.signal,
        skipMessagesSentBeforeStart: true,
        onMessage: (message) => enqueue('Handling a message', () => routeMessage(message)),
        onCallbackQuery: (callbackQuery) => enqueue('Handling a button press', () => routeCallbackQuery(callbackQuery)),
        onError: (error) => logger.error(error, '❌ Polling Telegram failed'),
    });
}

// A failure of the polling is an unhandled rejection: Node prints it and exits with 1.
void main();
