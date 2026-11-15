import {
    describe, expect, it, vi,
} from 'vitest';

import type { AuthStatus } from './claude.ts';
import type { LoginResult, LoginSession } from './login.ts';
import {
    createLoginAssistant, EXPIRY_NOTICE_REPEAT_MS, LOGIN_REMINDER_REPEAT_MS,
} from './loginAssistant.ts';

const NOW = new Date('2026-12-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK = 'https://claude.com/cai/oauth/authorize?state=abc';
const LINK_MESSAGE = `Open this link, log in to your Claude account, and send me the code from the page:\n${LINK}`;

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
        send: (text) => {
            sent.push(text);

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

        expect(sent).toEqual(['Could not start the login: no link']);
        expect(failing.cancel).toHaveBeenCalledOnce();
    });
});

describe('a login code', () => {
    it('is refused when no login waits for it', async () => {
        const { assistant, sent } = setup(loggedInUntil(30));

        await expect(assistant.handleText('code')).resolves.toBe(false);

        expect(sent).toEqual(['No login is waiting for a code. Send /auth to start one.']);
    });

    it('goes to the login command without the spaces around it, and the user hears until when the login is valid', async () => {
        const session = createSession();
        const { assistant, sent } = setup(loggedInUntil(30), [session]);

        await assistant.handleAuthCommand();
        const wasCode = await assistant.handleText('  the-code#state  ');

        expect(wasCode).toBe(true);
        expect(session.submitCode).toHaveBeenCalledWith('the-code#state');
        expect(sent.at(-1)).toBe('Logged in. The login is valid until 2027-01-09.');
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

        expect(sent.at(-2)).toBe('The login failed: exit code 1: invalid code\nSend /auth to try again.');
        expect(sent.at(-1)).toBe('No login is waiting for a code. Send /auth to start one.');
    });

    it('is reported as a failure when the command succeeded but Claude Code is still logged out', async () => {
        const { assistant, sent } = setup(LOGGED_OUT);

        await assistant.handleAuthCommand();
        await assistant.handleText('code');

        expect(sent.at(-1)).toContain('still not logged in');
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
            'The Claude login expires on 2026-12-15 (in 5 days). Send /auth to renew it.',
            'The Claude login expires on 2026-12-15 (in 4 days). Send /auth to renew it.',
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

    it('offers the login link when nobody is logged in, and repeats it every 6 hours', async () => {
        const {
            assistant, sent, advance,
        } = setup(LOGGED_OUT);

        await assistant.checkLogin();
        advance(LOGIN_REMINDER_REPEAT_MS - 1);
        await assistant.checkLogin();
        advance(1);
        await assistant.checkLogin();

        expect(sent).toHaveLength(2);
        expect(sent[0]).toBe(`Claude Code is not logged in.\n\n${LINK_MESSAGE}`);
    });

    it('stops a waiting login when someone logged in another way', async () => {
        const session = createSession();
        const {
            assistant, setStatus,
        } = setup(LOGGED_OUT, [session]);

        await assistant.checkLogin();
        setStatus(loggedInUntil(30));
        await assistant.checkLogin();

        expect(session.cancel).toHaveBeenCalledOnce();
        await expect(assistant.handleText('code')).resolves.toBe(false);
    });
});
