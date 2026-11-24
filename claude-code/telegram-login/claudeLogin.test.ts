import {
    describe, expect, it, vi,
} from 'vitest';

import {
    CLAUDE_LOGIN_BUTTON_DATA, CLAUDE_LOGOUT_BUTTON_DATA, EXPIRY_NOTICE_REPEAT_MS,
} from './claudeLogin';
import { createLoginAssistant } from './loginAssistant';
import {
    createSession, DAY_MS, dependenciesWith, LINK_MESSAGE, LOGGED_OUT, loggedInUntil, NOW, plain, setup,
} from './testing/assistantFixtures';

vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        },
    };
});

describe('the Claude login', () => {
    it('sends the login link', async () => {
        const { assistant, sent } = setup(loggedInUntil(30));

        await assistant.handleClaudeButton('login', undefined);

        expect(sent).toEqual([LINK_MESSAGE]);
    });

    it('stops the earlier login when it starts a new one', async () => {
        const first = createSession();
        const { assistant } = setup(loggedInUntil(30), [
            first,
            createSession(),
        ]);

        await assistant.handleClaudeButton('login', undefined);
        await assistant.handleClaudeButton('login', undefined);

        expect(first.cancel).toHaveBeenCalledOnce();
    });

    it('tells the user when the link does not come', async () => {
        const failing = createSession({ authorizationUrl: Promise.reject(new Error('no link')) });
        const { assistant, sent } = setup(loggedInUntil(30), [failing]);

        await assistant.handleClaudeButton('login', undefined);

        expect(sent).toEqual([plain('Could not start the login: no link')]);
        expect(failing.cancel).toHaveBeenCalledOnce();
    });
});

describe('a login code', () => {
    it('is refused when no login waits for it', async () => {
        const { assistant, sent } = setup(loggedInUntil(30));

        await expect(assistant.handleText('code')).resolves.toBe(false);

        expect(sent).toEqual([plain('No login is waiting for a code. Send /claude_auth or /claude_mcp to start one.')]);
    });

    it('goes to the login command without the spaces around it, and the user hears until when the login is valid', async () => {
        const session = createSession();
        const { assistant, sent } = setup(loggedInUntil(30), [session]);

        await assistant.handleClaudeButton('login', undefined);
        const wasCode = await assistant.handleText('  the-code#state  ');

        expect(wasCode).toBe(true);
        expect(session.submitCode).toHaveBeenCalledWith('the-code#state');
        expect(sent.at(-1)).toBe(plain('Logged in. The login is valid until 2027-01-09.'));
    });

    it('still counts as a code when the status cannot be read or the answer cannot be sent', async () => {
        const failingStatus = createLoginAssistant({
            getAuthStatus: () => Promise.reject(new Error('status failed')),
            startLogin: () => createSession(),
            logout: () => Promise.resolve(),
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendEditableMarkdown: () => {
                return { edit: () => Promise.resolve() };
            },
            editMarkdown: () => Promise.resolve(),
            sendMarkdown: () => Promise.resolve(),
            now: () => NOW,
        });
        const failingSend = createLoginAssistant({
            getAuthStatus: () => Promise.resolve(loggedInUntil(30)),
            startLogin: () => createSession(),
            logout: () => Promise.resolve(),
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendEditableMarkdown: () => {
                return { edit: () => Promise.resolve() };
            },
            editMarkdown: () => Promise.resolve(),
            sendMarkdown: vi.fn()
                .mockResolvedValueOnce(undefined)
                .mockRejectedValue(new Error('Telegram is down')),
            now: () => NOW,
        });

        await failingStatus.handleClaudeButton('login', undefined);
        await failingSend.handleClaudeButton('login', undefined);

        await expect(failingStatus.handleText('code')).resolves.toBe(true);
        await expect(failingSend.handleText('code')).resolves.toBe(true);
    });

    it('is reported when the login fails, and the next text starts nothing', async () => {
        const session = createSession({
            submitCode: () => Promise.resolve({
                ok: false,
                reason: 'exit code 1: invalid code',
            }),
        });
        const { assistant, sent } = setup(LOGGED_OUT, [session]);

        await assistant.handleClaudeButton('login', undefined);
        await expect(assistant.handleText('bad')).resolves.toBe(true);
        await assistant.handleText('bad again');

        expect(sent.at(-2)).toBe(plain('The login failed: exit code 1: invalid code\n\nSend /claude_auth to try again.'));
        expect(sent.at(-1)).toBe(plain('No login is waiting for a code. Send /claude_auth or /claude_mcp to start one.'));
    });

    it('is reported as a failure when the command succeeded but Claude Code is still logged out', async () => {
        const { assistant, sent } = setup(LOGGED_OUT);

        await assistant.handleClaudeButton('login', undefined);
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
            plain('The Claude login expires on 2026-12-15 (in 5 days). Send /claude_auth to renew it.'),
            plain('The Claude login expires on 2026-12-15 (in 4 days). Send /claude_auth to renew it.'),
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

        expect(sent).toEqual([plain('Claude Code is logged out. Send /claude_auth to log in.')]);
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
            logout: () => Promise.resolve(),
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendEditableMarkdown: () => {
                return { edit: () => Promise.resolve() };
            },
            editMarkdown: () => Promise.resolve(),
            sendMarkdown: send,
            now: () => NOW,
        });

        await expect(assistant.checkLogin()).rejects.toThrow('Telegram is down');
        await assistant.checkLogin();

        expect(send).toHaveBeenCalledTimes(2);
    });

    it('sends an expiry warning again on the next check when it could not be sent', async () => {
        const send = vi.fn()
            .mockRejectedValueOnce(new Error('Telegram is down'))
            .mockResolvedValue(undefined);
        const assistant = createLoginAssistant({
            getAuthStatus: () => Promise.resolve(loggedInUntil(3)),
            startLogin: () => createSession(),
            logout: () => Promise.resolve(),
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendEditableMarkdown: () => {
                return { edit: () => Promise.resolve() };
            },
            editMarkdown: () => Promise.resolve(),
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

        await assistant.handleClaudeButton('login', undefined);
        await assistant.checkLogin();
        await assistant.handleText('the-code#state');

        expect(session.cancel).not.toHaveBeenCalled();
        expect(session.submitCode).toHaveBeenCalledWith('the-code#state');
        expect(sent.at(-1)).toBe(plain('Logged in. The login is valid until 2026-12-13.'));
    });
});

describe('the /claude_auth command', () => {
    it('shows the status with the renew and logout buttons when Claude Code is logged in, and starts no login', async () => {
        const session = createSession();
        const {
            assistant, sent, keyboards,
        } = setup(loggedInUntil(30), [session]);

        await assistant.handleAuthCommand();

        expect(sent).toEqual([plain('✅ Claude Code is logged in. The login is valid until 2027-01-09.')]);
        expect(keyboards).toEqual([
            {
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
            },
        ]);
        await expect(assistant.handleText('code')).resolves.toBe(false);
    });

    it('sends the login link when Claude Code is logged out', async () => {
        const { assistant, sent } = setup(LOGGED_OUT);

        await assistant.handleAuthCommand();

        expect(sent).toEqual([LINK_MESSAGE]);
    });

    it('sends the login link when the status cannot be read', async () => {
        const sent: string[] = [];
        const assistant = createLoginAssistant(dependenciesWith({
            getAuthStatus: () => Promise.reject(new Error('status failed')),
            sendMarkdown: (markdown) => {
                sent.push(markdown);

                return Promise.resolve();
            },
        }));

        await assistant.handleAuthCommand();

        expect(sent).toEqual([LINK_MESSAGE]);
    });
});

describe('the buttons of the Claude status', () => {
    it('renew: sends a login link while Claude Code stays logged in', async () => {
        const {
            assistant, sent, logouts,
        } = setup(loggedInUntil(30));

        await expect(assistant.handleClaudeButton('login', 5)).resolves.toBe('🔑 Login link sent');

        expect(sent).toEqual([LINK_MESSAGE]);
        expect(logouts()).toBe(0);
    });

    it('logout: logs out, rewrites the status message, and sends no logged-out notice for it', async () => {
        const {
            assistant, sent, panelEdits, logouts,
        } = setup(loggedInUntil(30));

        await expect(assistant.handleClaudeButton('logout', 5)).resolves.toBe('🚪 Logged out');

        expect(logouts()).toBe(1);
        expect(panelEdits).toEqual([
            {
                messageId: 5,
                markdown: plain('🚪 Claude Code is logged out. Remote Control and the prompt API wait for the next login. Send /claude_auth to log in.'),
                replyMarkup: undefined,
            },
        ]);

        await assistant.checkLogin();

        expect(sent).toEqual([]);
    });

    it('logout: stops a Claude login that waits for a code', async () => {
        const session = createSession();
        const { assistant } = setup(loggedInUntil(30), [session]);

        await assistant.handleClaudeButton('login', undefined);
        await assistant.handleClaudeButton('logout', 5);

        expect(session.cancel).toHaveBeenCalledOnce();
        await expect(assistant.handleText('code')).resolves.toBe(false);
    });

    it('logout: says so when Claude Code is still logged in after it', async () => {
        const assistant = createLoginAssistant(dependenciesWith({ getAuthStatus: () => Promise.resolve(loggedInUntil(30)) }));

        await expect(assistant.handleClaudeButton('logout', 5)).resolves.toBe('❌ Still logged in, see the logs');
    });
});
