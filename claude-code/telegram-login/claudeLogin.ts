import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import type { AuthStatus } from './claude';
import type { LoginResult, LoginSession } from './login';
import type { PendingLoginSlot } from './pendingLogin';

export type ClaudeLoginDependencies = {
    getAuthStatus(): Promise<AuthStatus>;
    startLogin(): LoginSession;
    // Telegram Rich Markdown. The same function as for the MCP dialog, which also sends buttons.
    sendMarkdown(markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    now(): Date;
};

export type ClaudeLogin = {
    // Sends a login link; the code from the page comes as the next text message.
    handleAuthCommand(): Promise<void>;
    // Says once when Claude Code is logged out, and every day from 5 days before the login expires.
    checkLogin(): Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

        await sendText(`The login failed: ${reason}\n\nSend /auth to try again.`);
    }

    return {
        async handleAuthCommand() {
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
        },

        async checkLogin() {
            const status = await dependencies.getAuthStatus();
            const now = dependencies.now().getTime();

            if (!status.loggedIn) {
                // Once for each time the login is lost. The user asks for a link with /auth.
                if (!loggedOutNoticeSent) {
                    await sendText('Claude Code is logged out. Send /auth to log in.');
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

                await sendText(`The Claude login expires on ${formatDate(status.loginExpiresAt)} (in ${daysLeft} days). Send /auth to renew it.`);
                lastExpiryNoticeAt = now;
            }
        },
    };
}
