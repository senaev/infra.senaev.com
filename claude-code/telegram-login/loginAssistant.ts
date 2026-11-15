import type { AuthStatus } from './claude.ts';
import type { LoginSession } from './login.ts';

export type AssistantDependencies = {
    getAuthStatus(): Promise<AuthStatus>;
    startLogin(): LoginSession;
    send(text: string): Promise<void>;
    now(): Date;
};

export type LoginAssistant = {
    handleAuthCommand(): Promise<void>;
    // Returns true when the text was taken as a login code, so the caller can delete the message.
    handleText(text: string): Promise<boolean>;
    checkLogin(): Promise<void>;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const EXPIRY_WARNING_MS = 5 * DAY_MS;
export const EXPIRY_NOTICE_REPEAT_MS = DAY_MS;
export const LOGIN_REMINDER_REPEAT_MS = 6 * HOUR_MS;

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function createLoginAssistant(dependencies: AssistantDependencies): LoginAssistant {
    let session: LoginSession | null = null;
    let lastLoginReminderAt: number | null = null;
    let lastExpiryNoticeAt: number | null = null;

    function cancelSession(): void {
        session?.cancel();
        session = null;
    }

    async function beginLogin(intro: string): Promise<void> {
        cancelSession();
        const newSession = dependencies.startLogin();

        session = newSession;

        try {
            const url = await newSession.authorizationUrl;

            await dependencies.send(`${intro}Open this link, log in to your Claude account, and send me the code from the page:\n${url}`);
        } catch (error) {
            cancelSession();
            await dependencies.send(`Could not start the login: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return {
        async handleAuthCommand() {
            await beginLogin('');
        },

        async handleText(text) {
            const waitingSession = session;

            if (waitingSession === null) {
                await dependencies.send('No login is waiting for a code. Send /auth to start one.');

                return false;
            }

            session = null;
            const result = await waitingSession.submitCode(text.trim());
            const status = result.ok ? await dependencies.getAuthStatus() : null;

            if (status?.loggedIn === true) {
                lastExpiryNoticeAt = null;
                await dependencies.send(status.loginExpiresAt === null
                    ? 'Logged in.'
                    : `Logged in. The login is valid until ${formatDate(status.loginExpiresAt)}.`);
            } else {
                const reason = result.ok ? 'the login command finished, but Claude Code is still not logged in' : result.reason;

                await dependencies.send(`The login failed: ${reason}\nSend /auth to try again.`);
            }

            return true;
        },

        async checkLogin() {
            const status = await dependencies.getAuthStatus();
            const now = dependencies.now().getTime();

            if (!status.loggedIn) {
                if (lastLoginReminderAt === null || now - lastLoginReminderAt >= LOGIN_REMINDER_REPEAT_MS) {
                    lastLoginReminderAt = now;
                    await beginLogin('Claude Code is not logged in.\n\n');
                }

                return;
            }

            // Someone logged in another way, for example with kubectl exec.
            lastLoginReminderAt = null;
            cancelSession();

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

                await dependencies.send(`The Claude login expires on ${formatDate(status.loginExpiresAt)} (in ${daysLeft} days). Send /auth to renew it.`);
            }
        },
    };
}
