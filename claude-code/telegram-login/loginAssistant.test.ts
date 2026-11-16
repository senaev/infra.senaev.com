import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import {
    describe, expect, it, vi,
} from 'vitest';
import type { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import type { AuthStatus } from './claude';
import type { LoginResult, LoginSession } from './login';
import type { McpServer } from './mcp';
import {
    createLoginAssistant, EXPIRY_NOTICE_REPEAT_MS, renderMcpPanel,
} from './loginAssistant';

vi.mock('./logger', () => {
    return { logger: { error: vi.fn() } };
});

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

// The sessions are handed out in order, to the Claude and the MCP logins alike. When they run
// out, a plain session is made.
function setup(initialStatus: AuthStatus, sessions: LoginSession[] = [], initialMcpServers: McpServer[] = []) {
    let status = initialStatus;
    let mcpServers = initialMcpServers;
    const mcpLogins: string[] = [];
    const mcpLogouts: string[] = [];
    let storedNotices: string[] = [];
    const keyboards: (InlineKeyboardMarkup | undefined)[] = [];
    let now = NOW.getTime();
    const sent: string[] = [];
    const assistant = createLoginAssistant({
        getAuthStatus: () => Promise.resolve(status),
        startLogin: () => sessions.shift() ?? createSession(),
        listMcpServers: () => Promise.resolve(mcpServers),
        startMcpLogin: (serverName) => {
            mcpLogins.push(serverName);

            return sessions.shift() ?? createSession();
        },
        logoutMcpServer: (serverName) => {
            mcpLogouts.push(serverName);

            return Promise.resolve();
        },
        readMcpNotices: () => Promise.resolve(storedNotices),
        writeMcpNotices: (serverNames) => {
            storedNotices = serverNames;

            return Promise.resolve();
        },
        sendMarkdown: (markdown, replyMarkup) => {
            sent.push(markdown);
            keyboards.push(replyMarkup);

            return Promise.resolve();
        },
        now: () => new Date(now),
    });

    return {
        assistant,
        sent,
        mcpLogins,
        mcpLogouts,
        keyboards,
        storedNotices: () => storedNotices,
        setStoredNotices: (value: string[]) => {
            storedNotices = value;
        },
        setStatus: (value: AuthStatus) => {
            status = value;
        },
        setMcpServers: (value: McpServer[]) => {
            mcpServers = value;
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

        expect(sent).toEqual([plain('No login is waiting for a code. Send /auth or /mcp to start one.')]);
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

    it('still counts as a code when the status cannot be read or the answer cannot be sent', async () => {
        const failingStatus = createLoginAssistant({
            getAuthStatus: () => Promise.reject(new Error('status failed')),
            startLogin: () => createSession(),
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendMarkdown: () => Promise.resolve(),
            now: () => NOW,
        });
        const failingSend = createLoginAssistant({
            getAuthStatus: () => Promise.resolve(loggedInUntil(30)),
            startLogin: () => createSession(),
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendMarkdown: vi.fn()
                .mockResolvedValueOnce(undefined)
                .mockRejectedValue(new Error('Telegram is down')),
            now: () => NOW,
        });

        await failingStatus.handleAuthCommand();
        await failingSend.handleAuthCommand();

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

        await assistant.handleAuthCommand();
        await expect(assistant.handleText('bad')).resolves.toBe(true);
        await assistant.handleText('bad again');

        expect(sent.at(-2)).toBe(plain('The login failed: exit code 1: invalid code\n\nSend /auth to try again.'));
        expect(sent.at(-1)).toBe(plain('No login is waiting for a code. Send /auth or /mcp to start one.'));
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
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
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
            listMcpServers: () => Promise.resolve([]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
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

const DATADOG_NEEDS_LOGIN: McpServer = {
    name: 'datadog',
    status: 'Needs authentication',
    needsLogin: true,
};
const DATADOG_CONNECTED: McpServer = {
    name: 'datadog',
    status: 'Connected',
    needsLogin: false,
};
const GRAFANA_NEEDS_LOGIN: McpServer = {
    name: 'grafana',
    status: 'Needs authentication',
    needsLogin: true,
};
const MCP_LINK_MESSAGE = `${plain('Open the link and log in to datadog. The browser then opens a localhost page that does not load: copy its full address (it starts with http://localhost) and send it to me.')}\n\n${telegramLink({
    text: 'Log in to datadog',
    url: LINK,
})}`;
const REDIRECT_URL = 'http://localhost:64564/callback?code=abc&state=xyz';

function panel(servers: McpServer[], intro?: string) {
    return renderMcpPanel(servers, intro);
}

describe('renderMcpPanel', () => {
    it('lists the servers with their status, and gives each a login and a logout button', () => {
        expect(renderMcpPanel([
            DATADOG_CONNECTED,
            GRAFANA_NEEDS_LOGIN,
        ], 'Logged in to datadog.')).toEqual({
            markdown: [
                plain('Logged in to datadog.'),
                '**MCP servers of Claude Code**',
                `- ✅ ${plain('datadog: Connected')}\n- 🔑 ${plain('grafana: Needs authentication')}`,
            ].join('\n\n'),
            replyMarkup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔑 Log in: datadog',
                            callback_data: 'mcp:login:datadog',
                        },
                        {
                            text: '🚪 Log out: datadog',
                            callback_data: 'mcp:logout:datadog',
                        },
                    ],
                    [
                        {
                            text: '🔑 Log in: grafana',
                            callback_data: 'mcp:login:grafana',
                        },
                        {
                            text: '🚪 Log out: grafana',
                            callback_data: 'mcp:logout:grafana',
                        },
                    ],
                ],
            },
        });
    });

    it('marks a server that failed to connect, and gives no button to a name too long for Telegram', () => {
        const longName = 'x'.repeat(60);

        expect(renderMcpPanel([
            {
                name: longName,
                status: 'Failed to connect',
                needsLogin: false,
            },
        ])).toEqual({
            markdown: `**MCP servers of Claude Code**\n\n- ❌ ${plain(`${longName}: Failed to connect`)}`,
            replyMarkup: undefined,
        });
    });

    it('says where the servers come from when there are none', () => {
        expect(renderMcpPanel([])).toEqual({
            markdown: plain('Claude Code has no MCP servers. They come from agent.mcp of the workspace in the Helm values.'),
            replyMarkup: undefined,
        });
    });
});

describe('the /mcp command', () => {
    it('sends the panel without a name', async () => {
        const servers = [
            DATADOG_CONNECTED,
            GRAFANA_NEEDS_LOGIN,
        ];
        const {
            assistant, sent, keyboards,
        } = setup(loggedInUntil(30), [], servers);

        await assistant.handleMcpCommand('');

        expect(sent).toEqual([panel(servers).markdown]);
        expect(keyboards).toEqual([panel(servers).replyMarkup]);
    });

    it('sends the login link of a named server', async () => {
        const {
            assistant, sent, mcpLogins,
        } = setup(loggedInUntil(30), [], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpCommand('datadog');

        expect(mcpLogins).toEqual(['datadog']);
        expect(sent).toEqual([MCP_LINK_MESSAGE]);
    });

    it('starts no login for a server that is not in the list', async () => {
        const {
            assistant, sent, mcpLogins,
        } = setup(loggedInUntil(30), [], [DATADOG_CONNECTED]);

        await assistant.handleMcpCommand('evil;rm');

        expect(mcpLogins).toEqual([]);
        expect(sent).toEqual([panel([DATADOG_CONNECTED], 'There is no MCP server evil;rm.').markdown]);
    });

    it('tells the user when the servers cannot be listed, and keeps the login that waits for a code', async () => {
        const claudeLogin = createSession();
        const sent: string[] = [];
        const failing = createLoginAssistant({
            getAuthStatus: () => Promise.resolve(loggedInUntil(30)),
            startLogin: () => claudeLogin,
            listMcpServers: () => Promise.reject(new Error('claude mcp list failed with exit code 1')),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.resolve(),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendMarkdown: (markdown) => {
                sent.push(markdown);

                return Promise.resolve();
            },
            now: () => NOW,
        });

        await failing.handleAuthCommand();
        await failing.handleMcpCommand('');
        await failing.handleMcpButton('login', 'datadog');

        expect(sent.slice(-2)).toEqual([
            plain('Could not list the MCP servers: claude mcp list failed with exit code 1. Send /mcp to try again.'),
            plain('Could not list the MCP servers: claude mcp list failed with exit code 1. Send /mcp to try again.'),
        ]);
        expect(claudeLogin.cancel).not.toHaveBeenCalled();
        await expect(failing.handleText('the-code#state')).resolves.toBe(true);
        expect(claudeLogin.submitCode).toHaveBeenCalledWith('the-code#state');
    });
});

describe('the MCP buttons', () => {
    it('log in: sends the link and cancels a Claude login that waits for a code', async () => {
        const claudeLogin = createSession();
        const {
            assistant, sent, mcpLogins,
        } = setup(loggedInUntil(30), [
            claudeLogin,
            createSession(),
        ], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleAuthCommand();
        await assistant.handleMcpButton('login', 'datadog');

        expect(claudeLogin.cancel).toHaveBeenCalledOnce();
        expect(mcpLogins).toEqual(['datadog']);
        expect(sent.at(-1)).toBe(MCP_LINK_MESSAGE);
    });

    it('log in: tells the user when the link does not come', async () => {
        const failing = createSession({ authorizationUrl: Promise.reject(new Error('no link')) });
        const { assistant, sent } = setup(loggedInUntil(30), [failing], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog');

        expect(sent).toEqual([plain('Could not start the login to datadog: no link')]);
        expect(failing.cancel).toHaveBeenCalledOnce();
    });

    it('log out: logs out, stops a login of that server, sends the new panel, and adds no notice', async () => {
        const mcpLogin = createSession();
        const {
            assistant, sent, mcpLogouts, setMcpServers, storedNotices,
        } = setup(loggedInUntil(30), [mcpLogin], [DATADOG_CONNECTED]);

        await assistant.handleMcpButton('login', 'datadog');
        setMcpServers([DATADOG_NEEDS_LOGIN]);
        await assistant.handleMcpButton('logout', 'datadog');

        expect(mcpLogin.cancel).toHaveBeenCalledOnce();
        expect(mcpLogouts).toEqual(['datadog']);
        expect(sent.at(-1)).toBe(panel([DATADOG_NEEDS_LOGIN], 'Logged out of datadog.').markdown);
        expect(storedNotices()).toEqual(['datadog']);

        await assistant.checkMcpServers();

        expect(sent).toHaveLength(2);
    });

    it('log out: reports a failure with the panel', async () => {
        const sent: string[] = [];
        const assistant = createLoginAssistant({
            getAuthStatus: () => Promise.resolve(loggedInUntil(30)),
            startLogin: () => createSession(),
            listMcpServers: () => Promise.resolve([DATADOG_CONNECTED]),
            startMcpLogin: () => createSession(),
            logoutMcpServer: () => Promise.reject(new Error('claude mcp logout failed with exit code 1')),
            readMcpNotices: () => Promise.resolve([]),
            writeMcpNotices: () => Promise.resolve(),
            sendMarkdown: (markdown) => {
                sent.push(markdown);

                return Promise.resolve();
            },
            now: () => NOW,
        });

        await assistant.handleMcpButton('logout', 'datadog');

        expect(sent).toEqual([panel([DATADOG_CONNECTED], 'Could not log out of datadog: claude mcp logout failed with exit code 1').markdown]);
    });
});

describe('a redirect URL for an MCP login', () => {
    it('goes to the MCP login, and the user gets the panel with the new status', async () => {
        const session = createSession();
        const {
            assistant, sent, keyboards, setMcpServers,
        } = setup(loggedInUntil(30), [session], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog');
        setMcpServers([DATADOG_CONNECTED]);

        await expect(assistant.handleText(` ${REDIRECT_URL} `)).resolves.toBe(true);

        const expected = panel([DATADOG_CONNECTED], 'Logged in to datadog. New Claude Code sessions can use it.');

        expect(session.submitCode).toHaveBeenCalledWith(REDIRECT_URL);
        expect(sent.at(-1)).toBe(expected.markdown);
        expect(keyboards.at(-1)).toEqual(expected.replyMarkup);
    });

    it('is reported when the login command finished, but the server still needs a login', async () => {
        const { assistant, sent } = setup(loggedInUntil(30), [], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog');
        await assistant.handleText(REDIRECT_URL);

        expect(sent.at(-1)).toBe(panel([DATADOG_NEEDS_LOGIN], 'The login command finished, but datadog still needs a login.').markdown);
    });

    it('is reported when the login fails, and the next text starts nothing', async () => {
        const session = createSession({
            submitCode: () => Promise.resolve({
                ok: false,
                reason: 'That doesn\'t look like a redirect URL for this sign-in',
            }),
        });
        const { assistant, sent } = setup(loggedInUntil(30), [session], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog');
        await expect(assistant.handleText('wrong')).resolves.toBe(true);
        await assistant.handleText('again');

        expect(sent.at(-2)).toBe(panel([DATADOG_NEEDS_LOGIN], 'The login to datadog failed: That doesn\'t look like a redirect URL for this sign-in').markdown);
        expect(sent.at(-1)).toBe(plain('No login is waiting for a code. Send /auth or /mcp to start one.'));
    });
});

describe('the MCP server check', () => {
    it('sends the panel once for the servers that need a login, and again after one was logged in and lost it', async () => {
        const {
            assistant, sent, setMcpServers, storedNotices,
        } = setup(loggedInUntil(30), [], [
            DATADOG_NEEDS_LOGIN,
            GRAFANA_NEEDS_LOGIN,
        ]);

        await assistant.checkMcpServers();
        await assistant.checkMcpServers();

        expect(sent).toEqual([
            panel([
                DATADOG_NEEDS_LOGIN,
                GRAFANA_NEEDS_LOGIN,
            ], 'Some MCP servers of Claude Code need a login: datadog, grafana.').markdown,
        ]);
        expect(storedNotices()).toEqual([
            'datadog',
            'grafana',
        ]);

        setMcpServers([
            DATADOG_CONNECTED,
            GRAFANA_NEEDS_LOGIN,
        ]);
        await assistant.checkMcpServers();
        setMcpServers([
            DATADOG_NEEDS_LOGIN,
            GRAFANA_NEEDS_LOGIN,
        ]);
        await assistant.checkMcpServers();

        expect(sent.at(-1)).toBe(panel([
            DATADOG_NEEDS_LOGIN,
            GRAFANA_NEEDS_LOGIN,
        ], 'Some MCP servers of Claude Code need a login: datadog.').markdown);
        expect(sent).toHaveLength(2);
    });

    it('does not repeat the notice after a restart', async () => {
        const {
            assistant, sent, setStoredNotices,
        } = setup(loggedInUntil(30), [], [DATADOG_NEEDS_LOGIN]);

        setStoredNotices(['datadog']);
        await assistant.checkMcpServers();

        expect(sent).toEqual([]);
    });

    it('says nothing when every server is connected', async () => {
        const { assistant, sent } = setup(loggedInUntil(30), [], [DATADOG_CONNECTED]);

        await assistant.checkMcpServers();

        expect(sent).toEqual([]);
    });
});
