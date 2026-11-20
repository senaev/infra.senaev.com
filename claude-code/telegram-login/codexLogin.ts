import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import {
    escapeTelegramMarkdown, telegramCode, telegramLink,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import type { CodexDeviceLogin } from './codex';
import { logger } from './logger';
import type { LoginResult } from './login';

export type CodexLoginDependencies = {
    isLoggedIn(): Promise<boolean>;
    startLogin(): CodexDeviceLogin;
    logout(): Promise<void>;
    sendMarkdown(markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    editMarkdown(messageId: number, markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
};

export type CodexLogin = {
    // Logged in: the status with a logout button. Logged out: starts a device login and sends the
    // link and the code; a running one is stopped first.
    handleAuthCommand(): Promise<void>;
    // The logout button of the status message. Returns the short notice for the button press.
    handleLogoutButton(messageId: number | undefined): Promise<string>;
    // When Codex is logged out, starts a login by itself, once for each time the login is lost.
    checkLogin(): Promise<void>;
    stop(): void;
};

export const CODEX_LOGOUT_BUTTON_DATA = 'codex:logout';

const LOGGED_IN_KEYBOARD: InlineKeyboardMarkup = {
    inline_keyboard: [
        [
            {
                text: '🚪 Log out',
                callback_data: CODEX_LOGOUT_BUTTON_DATA,
            },
        ],
    ],
};

// The device login needs no answer in the chat: the CLI waits until the user enters the code on
// the page, then exits. So the result is reported when the CLI exits, apart from the queue of the
// messages, which must not wait up to 15 minutes.
export function createCodexLogin(dependencies: CodexLoginDependencies): CodexLogin {
    let running: CodexDeviceLogin | null = null;
    let autoLoginStarted = false;

    function sendText(text: string): Promise<void> {
        return dependencies.sendMarkdown(escapeTelegramMarkdown(text));
    }

    async function reportResult(login: CodexDeviceLogin, result: LoginResult): Promise<void> {
        // A login that was replaced or stopped reports nothing.
        if (running !== login) {
            return;
        }

        running = null;

        if (result.ok && await dependencies.isLoggedIn()) {
            autoLoginStarted = false;
            logger.info('✅ Codex is logged in');
            await sendText('✅ Codex is logged in.');

            return;
        }

        const reason = result.ok ? 'the login command finished, but Codex is still not logged in' : result.reason;

        logger.warn({ reason }, '⚠️ The Codex login failed');
        await sendText(`❌ The Codex login failed: ${reason}\n\nSend /codex_auth to try again.`);
    }

    async function startLogin(intro: string): Promise<void> {
        running?.cancel();
        const login = dependencies.startLogin();

        running = login;

        let prompt;

        try {
            prompt = await login.prompt;
        } catch (error) {
            login.cancel();

            if (running === login) {
                running = null;
            }

            await sendText(`Could not start the Codex login: ${stringifyUnknownError(error)}`);

            return;
        }

        logger.info('👉 Sending the Codex login link');
        await dependencies.sendMarkdown([
            escapeTelegramMarkdown(intro),
            escapeTelegramMarkdown('Open the link, sign in to ChatGPT, and enter this code. It expires in 15 minutes.'),
            telegramLink({
                text: 'Log in to Codex',
                url: prompt.url,
            }),
            telegramCode(prompt.code),
        ].join('\n\n'));

        void login.result
            .then((result) => reportResult(login, result))
            .catch((error: unknown) => {
                logger.error(error, '❌ Could not report the result of the Codex login');
            });
    }

    return {
        async handleAuthCommand() {
            if (running === null && await dependencies.isLoggedIn()) {
                await dependencies.sendMarkdown(escapeTelegramMarkdown('✅ Codex is logged in.'), LOGGED_IN_KEYBOARD);

                return;
            }

            await startLogin('🔑 Codex login');
        },

        async handleLogoutButton(messageId) {
            const login = running;

            running = null;
            login?.cancel();
            await dependencies.logout();
            // A logout that the user asked for: no login by itself until the user sends /codex_auth.
            autoLoginStarted = true;

            if (await dependencies.isLoggedIn()) {
                logger.warn('⚠️ Codex is still logged in after codex logout');

                return '❌ Still logged in, see the logs';
            }

            logger.info('🚪 Codex is logged out');
            const text = escapeTelegramMarkdown('🚪 Codex is logged out. Send /codex_auth to log in.');

            if (messageId === undefined) {
                await dependencies.sendMarkdown(text);
            } else {
                await dependencies.editMarkdown(messageId, text);
            }

            return '🚪 Logged out';
        },

        async checkLogin() {
            if (await dependencies.isLoggedIn()) {
                autoLoginStarted = false;

                return;
            }

            if (autoLoginStarted || running !== null) {
                return;
            }

            autoLoginStarted = true;
            await startLogin('🔑 Codex is logged out.');
        },

        stop() {
            const login = running;

            running = null;
            login?.cancel();
        },
    };
}
