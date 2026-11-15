import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import {
    describe, expect, it, vi,
} from 'vitest';

import type { AuthStatus } from './claude';
import type { LoginResult, LoginSession } from './login';
import {
    createLoginAssistant, EXPIRY_NOTICE_REPEAT_MS,
} from './loginAssistant';

const NOW = new Date('2026-12-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK = 'https://claude.com/cai/oauth/authorize?state=abc';
const plain = escapeTelegramMarkdown;
const LINK_MESSAGE = `${plain('Open the link, log in to your Claude account, and send me the code from the page.')}\n\n${telegramLink({
    text: 'Log in to Claude',
    url: LINK,
})}`;

const LOGGED_OUT: AuthStatus = {
    loggedIn: false,
    loginExpiresAt: null,
};

function loggedInUntil(daysFromNow: number): AuthStatus {
    return {
        loggedIn: true,
        loginExpiresAt: new Date(NOW.getTime() + daysFromNow * DAY_MS),
    };
}

function createSession(overrides: Partial<LoginSession> = {}): LoginSession {
    return {
        authorizationUrl: Promise.resolve(LINK),
        submitCode: vi.fn((): Promise<LoginResult> => Promise.resolve({ ok: true })),
        cancel: vi.fn(),
        ...overrides,
    };
}

// The sessions are handed out in order. When they run out, a plain session is made.
function setup(initialStatus: AuthStatus, sessions: LoginSession[] = []) {
    let status = initialStatus;
    let now = NOW.getTime();
    const sent: string[] = [];
    const assistant = createLoginAssistant({
        getAuthStatus: () => Promise.resolve(status),
        startLogin: () => sessions.shift() ?? createSession(),
        sendMarkdown: (markdown) => {
            sent.push(markdown);

            return Promise.resolve();
        },
        now: () => new Date(now),
    });

    return {
        assistant,
        sent,
        setStatus: (value: AuthStatus) => {
            status = value;
        },
        advance: (milliseconds: number) => {
            now += milliseconds;
        },
    };
}

describe('the /auth command', () => {
    it('sends the login link', async () => {
        const { assistant, sent } = setup(loggedInUntil(30));

        await assistant.handleAuthCommand();

        expect(sent).toEqual([LINK_MESSAGE]);
    });

    it('stops the earlier login when it starts a new one', async () => {
        const first = createSession();
        const { assistant } = setup(loggedInUntil(30), [
            first,
            createSession(),
        ]);

        await assistant.handleAuthCommand();
        await assistant.handleAuthCommand();

        expect(first.cancel).toHaveBeenCalledOnce();
    });

    it('tells the user when the link does not come', async () => {
        const failing = createSession({ authorizationUrl: Promise.reject(new Error('no link')) });
        const { assistant, sent } = setup(loggedInUntil(30), [failing]);

        await assistant.handleAuthCommand();

        expect(sent).toEqual([plain('Could not start the login: no link')]);
        expect(failing.cancel).toHaveBeenCalledOnce();
    });
});

describe('a login code', () => {
    it('is refused when no login waits for it', async () => {
        const { assistant, sent } = setup(loggedInUntil(30));

        await expect(assistant.handleText('code')).resolves.toBe(false);

        expect(sent).toEqual([plain('No login is waiting for a code. Send /auth to start one.')]);
    });

    it('goes to the login command without the spaces around it, and the user hears until when the login is valid', async () => {
        const session = createSession();
        const { assistant, sent } = setup(loggedInUntil(30), [session]);

        await assistant.handleAuthCommand();
        const wasCode = await assistant.handleText('  the-code#state  ');

        expect(wasCode).toBe(true);
        expect(session.submitCode).toHaveBeenCalledWith('the-code#state');
        expect(sent.at(-1)).toBe(plain('Logged in. The login is valid until 2027-01-09.'));
    });

    it('is reported when the login fails, and the next text starts nothing', async () => {
        const session = createSession({
            submitCode: () => Promise.resolve({
                ok: false,
                reason: 'exit code 1: invalid code',
            }),
        });
        const { assistant, sent } = setup(LOGGED_OUT, [session]);

        await assistant.handleAuthCommand();
        await expect(assistant.handleText('bad')).resolves.toBe(true);
        await assistant.handleText('bad again');

        expect(sent.at(-2)).toBe(plain('The login failed: exit code 1: invalid code\nSend /auth to try again.'));
        expect(sent.at(-1)).toBe(plain('No login is waiting for a code. Send /auth to start one.'));
    });

    it('is reported as a failure when the command succeeded but Claude Code is still logged out', async () => {
        const { assistant, sent } = setup(LOGGED_OUT);

        await assistant.handleAuthCommand();
        await assistant.handleText('code');

        expect(sent.at(-1)).toContain('still not logged in');
        expect(sent.at(-1)).toContain('failed');
    });
});

describe('the login check', () => {
    it('stays silent while the login is valid for more than 5 days', async () => {
        const { assistant, sent } = setup(loggedInUntil(6));

        await assistant.checkLogin();

        expect(sent).toEqual([]);
    });

    it('warns once a day from 5 days before the expiry', async () => {
        const {
            assistant, sent, advance,
        } = setup(loggedInUntil(5));

        await assistant.checkLogin();
        advance(EXPIRY_NOTICE_REPEAT_MS - 1);
        await assistant.checkLogin();
        advance(1);
        await assistant.checkLogin();

        expect(sent).toEqual([
            plain('The Claude login expires on 2026-12-15 (in 5 days). Send /auth to renew it.'),
            plain('The Claude login expires on 2026-12-15 (in 4 days). Send /auth to renew it.'),
        ]);
    });

    it('warns again when a renewal is followed by a new warning window', async () => {
        const {
            assistant, sent, setStatus,
        } = setup(loggedInUntil(2));

        await assistant.checkLogin();
        setStatus(loggedInUntil(30));
        await assistant.checkLogin();
        setStatus(loggedInUntil(2));
        await assistant.checkLogin();

        expect(sent).toHaveLength(2);
    });

    it('says once that Claude Code is logged out, and sends no link', async () => {
        const {
            assistant, sent, advance,
        } = setup(LOGGED_OUT);

        await assistant.checkLogin();
        advance(7 * DAY_MS);
        await assistant.checkLogin();

        expect(sent).toEqual([plain('Claude Code is logged out. Send /auth to log in.')]);
    });

    it('says it again when the login is lost a second time', async () => {
        const {
            assistant, sent, setStatus,
        } = setup(LOGGED_OUT);

        await assistant.checkLogin();
        setStatus(loggedInUntil(30));
        await assistant.checkLogin();
        setStatus(LOGGED_OUT);
        await assistant.checkLogin();

        expect(sent).toHaveLength(2);
    });

    it('tries again on the next check when the notice could not be sent', async () => {
        const send = vi.fn()
            .mockRejectedValueOnce(new Error('Telegram is down'))
            .mockResolvedValue(undefined);
        const assistant = createLoginAssistant({
            getAuthStatus: () => Promise.resolve(LOGGED_OUT),
            startLogin: () => createSession(),
            sendMarkdown: send,
            now: () => NOW,
        });

        await expect(assistant.checkLogin()).rejects.toThrow('Telegram is down');
        await assistant.checkLogin();

        expect(send).toHaveBeenCalledTimes(2);
    });

    it('keeps a login that waits for a code while the user is still logged in, for a renewal', async () => {
        const session = createSession();
        const {
            assistant, sent,
        } = setup(loggedInUntil(3), [session]);

        await assistant.handleAuthCommand();
        await assistant.checkLogin();
        await assistant.handleText('the-code#state');

        expect(session.cancel).not.toHaveBeenCalled();
        expect(session.submitCode).toHaveBeenCalledWith('the-code#state');
        expect(sent.at(-1)).toBe(plain('Logged in. The login is valid until 2026-12-13.'));
    });
});
