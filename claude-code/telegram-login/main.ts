import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';
import { installGracefulShutdown } from 'senaev-utils/src/utils/process/installGracefulShutdown';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';
import { promiseTimeout } from 'senaev-utils/src/utils/timers/promiseTimeout/promiseTimeout';

import { getAuthStatus, runCommand } from './claude';
import { logger } from './logger';
import { spawnClaudeLogin, startLogin } from './login';
import { createLoginAssistant } from './loginAssistant';
import { createMessageRouter } from './messageRouter';
import { deleteTelegramMessage, getTelegramMessages } from './telegram';

const POLL_TIMEOUT_SECONDS = 50;
const POLL_RETRY_DELAY_MS = 5_000;
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
        chatId,
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

function enqueue(description: string, step: () => Promise<void>): void {
    queue = queue.then(step).catch((error: unknown) => {
        logger.error(error, `❌ ${description} failed`);
    });
}

async function pollMessages(): Promise<void> {
    // Messages from before the start are old: skip them, and begin with the new ones.
    let offset = (await getTelegramMessages({
        token,
        offset: -1,
        timeoutSeconds: 0,
    })).nextOffset;

    while (!lifecycle.signal.aborted) {
        try {
            const batch = await getTelegramMessages({
                token,
                offset,
                timeoutSeconds: POLL_TIMEOUT_SECONDS,
            });

            offset = batch.nextOffset ?? offset;

            for (const message of batch.messages) {
                enqueue('Handling a message', () => routeMessage(message));
            }
        } catch (error) {
            logger.error(error, '❌ Polling Telegram failed');
            await promiseTimeout(POLL_RETRY_DELAY_MS);
        }
    }
}

function main(): Promise<void> {
    logger.info('🚀 Telegram login helper started');
    enqueue('Checking the login', () => assistant.checkLogin());
    setInterval(() => enqueue('Checking the login', () => assistant.checkLogin()), LOGIN_CHECK_INTERVAL_MS).unref();

    return pollMessages();
}

main().catch(async (error) => {
    if (!lifecycle.signal.aborted) {
        logger.error(error, '❌ Telegram login helper exited');
        await lifecycle.shutdown(1);
    }
});
