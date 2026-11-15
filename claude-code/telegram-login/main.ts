import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';
import { installGracefulShutdown } from 'senaev-utils/src/utils/process/installGracefulShutdown';
import { deleteTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/deleteTelegramMessage';
import { pollTelegramMessages } from 'senaev-utils/src/utils/TelegramApi/pollTelegramMessages';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { getAuthStatus, runCommand } from './claude';
import { logger } from './logger';
import { spawnClaudeLogin, startLogin } from './login';
import { createLoginAssistant } from './loginAssistant';
import { createMessageRouter } from './messageRouter';

const LOGIN_CHECK_INTERVAL_MS = 10 * 60 * 1000;

const token = requireEnv('TELEGRAM_BOT_TOKEN');
const allowedUserId = Number(requireEnv('TELEGRAM_USER_ID'));

if (!Number.isSafeInteger(allowedUserId)) {
    throw new Error('TELEGRAM_USER_ID must be a number');
}

const assistant = createLoginAssistant({
    getAuthStatus: () => getAuthStatus(runCommand),
    startLogin: () => startLogin(spawnClaudeLogin),
    sendMarkdown: async (markdown) => {
        await sendTelegramMessage({
            text: markdown,
            chatId: String(allowedUserId),
            token,
            disableLinkPreview: true,
        });
    },
    now: () => new Date(),
});
const routeMessage = createMessageRouter({
    allowedUserId,
    assistant,
    deleteMessage: (chatId, messageId) => deleteTelegramMessage({
        token,
        chatId: String(chatId),
        messageId,
    }),
});

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
    void enqueue('Checking the login', () => assistant.checkLogin());
    setInterval(() => {
        void enqueue('Checking the login', () => assistant.checkLogin());
    }, LOGIN_CHECK_INTERVAL_MS).unref();

    return pollTelegramMessages({
        token,
        signal: lifecycle.signal,
        skipMessagesSentBeforeStart: true,
        onMessage: (message) => enqueue('Handling a message', () => routeMessage(message)),
        onError: (error) => logger.error(error, '❌ Polling Telegram failed'),
    });
}

main().catch(async (error) => {
    if (!lifecycle.signal.aborted) {
        logger.error(error, '❌ Telegram login helper exited');
        await lifecycle.shutdown(1);
    }
});
