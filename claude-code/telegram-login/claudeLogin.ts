import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import type { AuthStatus } from './claude';
import type { LoginResult, LoginSession } from './login';
import { logger } from './logger';
import type { PendingLoginSlot } from './pendingLogin';

export type ClaudeLoginDependencies = {
    getAuthStatus(): Promise<AuthStatus>;
    startLogin(): LoginSession;
    logout(): Promise<void>;
    // Telegram Rich Markdown. The same function as for the MCP dialog, which also sends buttons.
    sendMarkdown(markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    editMarkdown(messageId: number, markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    now(): Date;
};

export type ClaudeButtonAction = 'login' | 'logout';

export type ClaudeLogin = {
    // Logged in: the status with the renew and logout buttons. Logged out: sends a login link; the
    // code from the page comes as the next text message.
    handleAuthCommand(): Promise<void>;
    // A button of the status message. Returns the short notice for the button press.
    handleClaudeButton(action: ClaudeButtonAction, messageId: number | undefined): Promise<string>;
    // Says once when Claude Code is logged out, and every day from 5 days before the login expires.
    checkLogin(): Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const CLAUDE_LOGIN_BUTTON_DATA = 'claude:login';
export const CLAUDE_LOGOUT_BUTTON_DATA = 'claude:logout';

const LOGGED_IN_KEYBOARD: InlineKeyboardMarkup = {
    inline_keyboard: [
        [
            {
                text: '🔑 Renew login',
                callback_data: CLAUDE_LOGIN_BUTTON_DATA,
            },
            {
                text: '🚪 Log out',
                callback_data: CLAUDE_LOGOUT_BUTTON_DATA,
            },
        ],
    ],
};

export function parseClaudeButtonData(data: string): ClaudeButtonAction | undefined {
    if (data === CLAUDE_LOGIN_BUTTON_DATA) {
        return 'login';
    }

    return data === CLAUDE_LOGOUT_BUTTON_DATA ? 'logout' : undefined;
}

export const EXPIRY_WARNING_MS = 5 * DAY_MS;
export const EXPIRY_NOTICE_REPEAT_MS = DAY_MS;

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function createClaudeLogin(dependencies: ClaudeLoginDependencies, slot: PendingLoginSlot): ClaudeLogin {
    let loggedOutNoticeSent = false;
    let lastExpiryNoticeAt: number | null = null;

    function sendText(text: string): Promise<void> {
        return dependencies.sendMarkdown(escapeTelegramMarkdown(text));
    }

    async function reportLoginResult(result: LoginResult): Promise<void> {
        const status = result.ok ? await dependencies.getAuthStatus() : null;

        if (status?.loggedIn === true) {
            lastExpiryNoticeAt = null;
            loggedOutNoticeSent = false;
            await sendText(status.loginExpiresAt === null
                ? 'Logged in.'
                : `Logged in. The login is valid until ${formatDate(status.loginExpiresAt)}.`);

            return;
        }

        const reason = result.ok ? 'the login command finished, but Claude Code is still not logged in' : result.reason;

        await sendText(`The login failed: ${reason}\n\nSend /claude_auth to try again.`);
    }

    async function startLogin(): Promise<void> {
    // The previous login stops before the next command starts.
        slot.cancel();
        const session = dependencies.startLogin();

        slot.begin({
            session,
            report: reportLoginResult,
        });

        try {
            const url = await session.authorizationUrl;
            const intro = escapeTelegramMarkdown('Open the link, log in to your Claude account, and send me the code from the page.');

            await dependencies.sendMarkdown(`${intro}\n\n${telegramLink({
                text: 'Log in to Claude',
                url,
            })}`);
        } catch (error) {
            slot.cancel(session);
            await sendText(`Could not start the login: ${stringifyUnknownError(error)}`);
        }
    }

    function describeStatus(status: AuthStatus): string {
        return status.loginExpiresAt === null
            ? '✅ Claude Code is logged in.'
            : `✅ Claude Code is logged in. The login is valid until ${formatDate(status.loginExpiresAt)}.`;
    }

    return {
        async handleAuthCommand() {
            let status: AuthStatus | null = null;

            try {
                status = await dependencies.getAuthStatus();
            } catch (error) {
                // Without a status, a new login is the way out.
                logger.warn({ err: error }, '⚠️ Could not read the Claude login status, starting a login');
            }

            if (status?.loggedIn === true) {
                await dependencies.sendMarkdown(escapeTelegramMarkdown(describeStatus(status)), LOGGED_IN_KEYBOARD);

                return;
            }

            await startLogin();
        },

        async handleClaudeButton(action, messageId) {
            if (action === 'login') {
                await startLogin();

                return '🔑 Login link sent';
            }

            // Only a waiting Claude login stops; an MCP login keeps its slot.
            if (slot.current()?.mcpServerName === undefined) {
                slot.cancel();
            }

            await dependencies.logout();
            const status = await dependencies.getAuthStatus();

            if (status.loggedIn) {
                logger.warn('⚠️ Claude Code is still logged in after claude auth logout');

                return '❌ Still logged in, see the logs';
            }

            // A logout that the user asked for: no logged-out notice for it.
            loggedOutNoticeSent = true;
            lastExpiryNoticeAt = null;
            logger.info('🚪 Claude Code is logged out');
            const text = escapeTelegramMarkdown('🚪 Claude Code is logged out. Remote Control and the prompt API wait for the next login. Send /claude_auth to log in.');

            if (messageId === undefined) {
                await dependencies.sendMarkdown(text);
            } else {
                await dependencies.editMarkdown(messageId, text);
            }

            return '🚪 Logged out';
        },

        async checkLogin() {
            const status = await dependencies.getAuthStatus();
            const now = dependencies.now().getTime();

            if (!status.loggedIn) {
                // Once for each time the login is lost. The user asks for a link with /claude_auth.
                if (!loggedOutNoticeSent) {
                    await sendText('Claude Code is logged out. Send /claude_auth to log in.');
                    loggedOutNoticeSent = true;
                }

                return;
            }

            loggedOutNoticeSent = false;

            if (status.loginExpiresAt === null) {
                return;
            }

            const msLeft = status.loginExpiresAt.getTime() - now;

            if (msLeft > EXPIRY_WARNING_MS) {
                lastExpiryNoticeAt = null;

                return;
            }

            if (lastExpiryNoticeAt === null || now - lastExpiryNoticeAt >= EXPIRY_NOTICE_REPEAT_MS) {
                const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));

                await sendText(`The Claude login expires on ${formatDate(status.loginExpiresAt)} (in ${daysLeft} days). Send /claude_auth to renew it.`);
                lastExpiryNoticeAt = now;
            }
        },
    };
}
