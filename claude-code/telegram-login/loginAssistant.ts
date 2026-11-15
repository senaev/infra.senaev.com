import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';

import type { AuthStatus } from './claude';
import type { LoginSession } from './login';

export type AssistantDependencies = {
    getAuthStatus(): Promise<AuthStatus>;
    startLogin(): LoginSession;
    // Telegram Rich Markdown.
    sendMarkdown(markdown: string): Promise<void>;
    now(): Date;
};

export type LoginAssistant = {
    handleAuthCommand(): Promise<void>;
    // Returns true when the text was taken as a login code, so the caller can delete the message.
    handleText(text: string): Promise<boolean>;
    checkLogin(): Promise<void>;
    stop(): void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const EXPIRY_WARNING_MS = 5 * DAY_MS;
export const EXPIRY_NOTICE_REPEAT_MS = DAY_MS;

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function createLoginAssistant(dependencies: AssistantDependencies): LoginAssistant {
    let session: LoginSession | null = null;
    let loggedOutNoticeSent = false;
    let lastExpiryNoticeAt: number | null = null;

    function sendText(text: string): Promise<void> {
        return dependencies.sendMarkdown(escapeTelegramMarkdown(text));
    }

    function cancelSession(): void {
        session?.cancel();
        session = null;
    }

    async function beginLogin(): Promise<void> {
        cancelSession();
        const newSession = dependencies.startLogin();

        session = newSession;

        try {
            const url = await newSession.authorizationUrl;
            const intro = escapeTelegramMarkdown('Open the link, log in to your Claude account, and send me the code from the page.');

            await dependencies.sendMarkdown(`${intro}\n\n${telegramLink({
                text: 'Log in to Claude',
                url,
            })}`);
        } catch (error) {
            cancelSession();
            await sendText(`Could not start the login: ${stringifyUnknownError(error)}`);
        }
    }

    return {
        async handleAuthCommand() {
            await beginLogin();
        },

        async handleText(text) {
            const waitingSession = session;

            if (waitingSession === null) {
                await sendText('No login is waiting for a code. Send /auth to start one.');

                return false;
            }

            session = null;
            const result = await waitingSession.submitCode(text.trim());
            const status = result.ok ? await dependencies.getAuthStatus() : null;

            if (status?.loggedIn === true) {
                lastExpiryNoticeAt = null;
                loggedOutNoticeSent = false;
                await sendText(status.loginExpiresAt === null
                    ? 'Logged in.'
                    : `Logged in. The login is valid until ${formatDate(status.loginExpiresAt)}.`);
            } else {
                const reason = result.ok ? 'the login command finished, but Claude Code is still not logged in' : result.reason;

                await sendText(`The login failed: ${reason}\nSend /auth to try again.`);
            }

            return true;
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
                lastExpiryNoticeAt = now;
                const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));

                await sendText(`The Claude login expires on ${formatDate(status.loginExpiresAt)} (in ${daysLeft} days). Send /auth to renew it.`);
            }
        },

        stop() {
            cancelSession();
        },
    };
}
