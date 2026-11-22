import {
    describe, expect, it, vi,
} from 'vitest';

import { createLoginAssistant } from './loginAssistant';
import {
    createSession, DATADOG_CONNECTED, DATADOG_NEEDS_LOGIN, dependenciesWith, GRAFANA_NEEDS_LOGIN, loggedInUntil,
    MCP_LINK_MESSAGE, panel, PANEL_ID, plain, REDIRECT_URL, setup,
} from './testing/assistantFixtures';

vi.mock('./logger', () => {
    return {
        logger: {
            error: vi.fn(),
            warn: vi.fn(),
        },
    };
});

describe('the /claude_mcp command', () => {
    it('posts a message at once and turns it into the panel', async () => {
        const servers = [
            DATADOG_CONNECTED,
            GRAFANA_NEEDS_LOGIN,
        ];
        const {
            assistant, editable, sent,
        } = setup(loggedInUntil(30), [], servers);

        await assistant.handleMcpCommand();

        expect(sent).toEqual([]);
        expect(editable).toEqual([
            {
                replyTo: undefined,
                texts: [
                    plain('⏳ Checking the MCP servers…'),
                    panel(servers).markdown,
                ],
                keyboard: panel(servers).replyMarkup,
            },
        ]);
    });

    it('says so when the servers cannot be listed, and keeps the login that waits for a code', async () => {
        const claudeLogin = createSession();
        const texts: string[] = [];
        const assistant = createLoginAssistant(dependenciesWith({
            startLogin: () => claudeLogin,
            listMcpServers: () => Promise.reject(new Error('claude mcp list failed with exit code 1')),
            sendEditableMarkdown: (markdown) => {
                texts.push(markdown);

                return {
                    edit: (edited) => {
                        texts.push(edited);

                        return Promise.resolve();
                    },
                };
            },
        }));

        await assistant.handleClaudeButton('login', undefined);
        await assistant.handleMcpCommand();

        expect(texts.at(-1)).toBe(plain('Could not list the MCP servers: claude mcp list failed with exit code 1. Send /claude_mcp to try again.'));
        expect(claudeLogin.cancel).not.toHaveBeenCalled();
        await expect(assistant.handleText('the-code#state')).resolves.toBe(true);
        expect(claudeLogin.submitCode).toHaveBeenCalledWith('the-code#state');
    });
});

describe('the login button', () => {
    it('replies to the panel with the link, and cancels a Claude login that waits for a code', async () => {
        const claudeLogin = createSession();
        const {
            assistant, editable, mcpLogins,
        } = setup(loggedInUntil(30), [
            claudeLogin,
            createSession(),
        ], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleClaudeButton('login', undefined);
        const notice = await assistant.handleMcpButton('login', 'datadog', PANEL_ID);

        expect(notice).toBe('🔑 The login link is in the chat');
        expect(claudeLogin.cancel).toHaveBeenCalledOnce();
        expect(mcpLogins).toEqual(['datadog']);
        expect(editable).toEqual([
            {
                replyTo: PANEL_ID,
                texts: [
                    plain('⏳ Starting the login to datadog…'),
                    MCP_LINK_MESSAGE,
                ],
                keyboard: undefined,
            },
        ]);
    });

    it('says in the same message when the link does not come', async () => {
        const failing = createSession({ authorizationUrl: Promise.reject(new Error('no link')) });
        const { assistant, editable } = setup(loggedInUntil(30), [failing], [DATADOG_NEEDS_LOGIN]);

        await expect(assistant.handleMcpButton('login', 'datadog', PANEL_ID)).resolves.toBe('❌ The login did not start');

        expect(editable[0]?.texts.at(-1)).toBe(plain('❌ Could not start the login to datadog: no link'));
        expect(failing.cancel).toHaveBeenCalledOnce();
        await expect(assistant.handleText('anything')).resolves.toBe(false);
    });

    it('marks the link of an earlier login as stopped when a new one starts', async () => {
        const { assistant, editable } = setup(loggedInUntil(30), [], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog', PANEL_ID);
        await assistant.handleMcpButton('login', 'datadog', PANEL_ID);

        expect(editable[0]?.texts.at(-1)).toBe(plain('⏹ The login to datadog was stopped.'));
        expect(editable[1]?.texts.at(-1)).toBe(MCP_LINK_MESSAGE);
    });
});

describe('a redirect URL for an MCP login', () => {
    it('ends the link message with the result and rewrites the panel in place', async () => {
        const session = createSession();
        const {
            assistant, editable, panelEdits, setMcpServers,
        } = setup(loggedInUntil(30), [session], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog', PANEL_ID);
        setMcpServers([DATADOG_CONNECTED]);

        await expect(assistant.handleText(` ${REDIRECT_URL} `)).resolves.toBe(true);

        expect(session.submitCode).toHaveBeenCalledWith(REDIRECT_URL);
        expect(editable[0]?.texts.at(-1)).toBe(plain('✅ Logged in to datadog. New Claude Code sessions can use it.'));
        expect(panelEdits).toEqual([
            {
                messageId: PANEL_ID,
                ...panel([DATADOG_CONNECTED]),
            },
        ]);
    });

    it('is reported when the login command finished, but the server still needs a login', async () => {
        const {
            assistant, editable, panelEdits,
        } = setup(loggedInUntil(30), [], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog', PANEL_ID);
        await assistant.handleText(REDIRECT_URL);

        expect(editable[0]?.texts.at(-1)).toBe(plain('❌ The login command finished, but datadog still needs a login.'));
        expect(panelEdits).toHaveLength(1);
    });

    it('is reported when the login fails, and the next text starts nothing', async () => {
        const session = createSession({
            submitCode: () => Promise.resolve({
                ok: false,
                reason: 'That doesn\'t look like a redirect URL for this sign-in',
            }),
        });
        const {
            assistant, editable, sent,
        } = setup(loggedInUntil(30), [session], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog', PANEL_ID);
        await expect(assistant.handleText('wrong')).resolves.toBe(true);
        await assistant.handleText('again');

        expect(editable[0]?.texts.at(-1)).toBe(plain('❌ The login to datadog failed: That doesn\'t look like a redirect URL for this sign-in'));
        expect(sent.at(-1)).toBe(plain('No login is waiting for a code. Send /claude_auth or /claude_mcp to start one.'));
    });

    it('posts a new panel when the panel message is not known', async () => {
        const {
            assistant, panelEdits, sent, setMcpServers,
        } = setup(loggedInUntil(30), [], [DATADOG_NEEDS_LOGIN]);

        await assistant.handleMcpButton('login', 'datadog', undefined);
        setMcpServers([DATADOG_CONNECTED]);
        await assistant.handleText(REDIRECT_URL);

        expect(panelEdits).toEqual([]);
        expect(sent).toEqual([panel([DATADOG_CONNECTED]).markdown]);
    });
});

describe('the saved notices', () => {
    it('are written again at the next check when a write failed', async () => {
        const writes: string[][] = [];
        const assistant = createLoginAssistant(dependenciesWith({
            listMcpServers: () => Promise.resolve([DATADOG_NEEDS_LOGIN]),
            writeMcpNotices: (serverNames) => {
                writes.push(serverNames);

                return writes.length === 1 ? Promise.reject(new Error('disk full')) : Promise.resolve();
            },
        }));

        await expect(assistant.checkMcpServers()).rejects.toThrow('disk full');
        await assistant.checkMcpServers();

        expect(writes).toEqual([
            ['datadog'],
            ['datadog'],
        ]);
    });
});

describe('the logout button', () => {
    it('logs out, stops a login of that server, rewrites the panel, and adds no notice', async () => {
        const mcpLogin = createSession();
        const {
            assistant, editable, sent, panelEdits, mcpLogouts, setMcpServers, storedNotices,
        } = setup(loggedInUntil(30), [mcpLogin], [DATADOG_CONNECTED]);

        await assistant.handleMcpButton('login', 'datadog', PANEL_ID);
        setMcpServers([DATADOG_NEEDS_LOGIN]);

        await expect(assistant.handleMcpButton('logout', 'datadog', PANEL_ID)).resolves.toBe('🚪 Logged out');

        expect(mcpLogin.cancel).toHaveBeenCalledOnce();
        expect(editable[0]?.texts.at(-1)).toBe(plain('⏹ The login to datadog was stopped.'));
        expect(mcpLogouts).toEqual(['datadog']);
        expect(panelEdits).toEqual([
            {
                messageId: PANEL_ID,
                ...panel([DATADOG_NEEDS_LOGIN], '🚪 Logged out of datadog.'),
            },
        ]);
        expect(storedNotices()).toEqual(['datadog']);

        await assistant.checkMcpServers();

        expect(sent).toEqual([]);
    });

    it('shows a failure in the panel', async () => {
        const panelEdits: string[] = [];
        const assistant = createLoginAssistant(dependenciesWith({
            logoutMcpServer: () => Promise.reject(new Error('claude mcp logout failed with exit code 1')),
            editMarkdown: (_, markdown) => {
                panelEdits.push(markdown);

                return Promise.resolve();
            },
        }));

        await expect(assistant.handleMcpButton('logout', 'datadog', PANEL_ID)).resolves.toBe('❌ The logout failed');

        expect(panelEdits).toEqual([panel([DATADOG_CONNECTED], '❌ Could not log out of datadog: claude mcp logout failed with exit code 1').markdown]);
    });
});

describe('the MCP server check', () => {
    it('posts the panel once for the servers that need a login, and again after one was logged in and lost it', async () => {
        const {
            assistant, sent, keyboards, setMcpServers, storedNotices,
        } = setup(loggedInUntil(30), [], [
            DATADOG_NEEDS_LOGIN,
            GRAFANA_NEEDS_LOGIN,
        ]);
        const bothNeedLogin = [
            DATADOG_NEEDS_LOGIN,
            GRAFANA_NEEDS_LOGIN,
        ];

        await assistant.checkMcpServers();
        await assistant.checkMcpServers();

        expect(sent).toEqual([panel(bothNeedLogin, '⚠️ Some MCP servers of Claude Code need a login: datadog, grafana.').markdown]);
        expect(keyboards).toEqual([panel(bothNeedLogin).replyMarkup]);
        expect(storedNotices()).toEqual([
            'datadog',
            'grafana',
        ]);

        setMcpServers([
            DATADOG_CONNECTED,
            GRAFANA_NEEDS_LOGIN,
        ]);
        await assistant.checkMcpServers();
        setMcpServers(bothNeedLogin);
        await assistant.checkMcpServers();

        expect(sent.at(-1)).toBe(panel(bothNeedLogin, '⚠️ Some MCP servers of Claude Code need a login: datadog.').markdown);
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
