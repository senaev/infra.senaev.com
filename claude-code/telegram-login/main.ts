import { getAuthStatus, runCommand } from './claude.ts';
import { spawnClaudeLogin, startLogin } from './login.ts';
import { createLoginAssistant } from './loginAssistant.ts';
import { createMessageRouter } from './messageRouter.ts';
import { createTelegramClient } from './telegram.ts';

const POLL_TIMEOUT_SECONDS = 50;
const POLL_RETRY_DELAY_MS = 5_000;
const LOGIN_CHECK_INTERVAL_MS = 10 * 60 * 1000;

function requireEnv(name: string): string {
    const value = process.env[name];

    if (value === undefined || value === '') {
        throw new Error(`${name} is required`);
    }

    return value;
}

function log(message: string): void {
    process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const allowedUserId = Number(requireEnv('TELEGRAM_USER_ID'));

if (!Number.isSafeInteger(allowedUserId)) {
    throw new Error('TELEGRAM_USER_ID must be a number');
}

const telegram = createTelegramClient(requireEnv('TELEGRAM_BOT_TOKEN'));
const assistant = createLoginAssistant({
    getAuthStatus: () => getAuthStatus(runCommand),
    startLogin: () => startLogin(spawnClaudeLogin),
    send: (text) => telegram.sendMessage(allowedUserId, text),
    now: () => new Date(),
});
const routeMessage = createMessageRouter({
    allowedUserId,
    assistant,
    deleteMessage: (chatId, messageId) => telegram.deleteMessage(chatId, messageId),
});

// One step at a time: a login code must not be handled while a check still waits for its answer.
let queue: Promise<void> = Promise.resolve();

function enqueue(name: string, step: () => Promise<void>): void {
    queue = queue.then(step).catch((error: unknown) => {
        log(`${name} failed: ${errorMessage(error)}`);
    });
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pollMessages(): Promise<never> {
    // Messages from before the start are old: skip them, and begin with the new ones.
    let offset = (await telegram.getMessages(-1, 0)).nextOffset;

    for (;;) {
        try {
            const batch = await telegram.getMessages(offset, POLL_TIMEOUT_SECONDS);

            offset = batch.nextOffset ?? offset;

            for (const message of batch.messages) {
                enqueue('Handling a message', () => routeMessage(message));
            }
        } catch (error) {
            log(`Polling Telegram failed: ${errorMessage(error)}`);
            await sleep(POLL_RETRY_DELAY_MS);
        }
    }
}

process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down');
    process.exit(0);
});

log('Telegram login helper started');
enqueue('Checking the login', () => assistant.checkLogin());
setInterval(() => enqueue('Checking the login', () => assistant.checkLogin()), LOGIN_CHECK_INTERVAL_MS);
await pollMessages();
