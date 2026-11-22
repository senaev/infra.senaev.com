import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';
import { vi } from 'vitest';

import type { AuthStatus } from '../claude';
import type { LoginResult, LoginSession } from '../login';
import { type AssistantDependencies, createLoginAssistant } from '../loginAssistant';
import type { McpServer } from '../mcp';
import { renderMcpPanel } from '../mcpPanel';

// Fakes for the tests of the login assistant: the Claude login and the MCP dialog.

export const NOW = new Date('2026-12-10T12:00:00.000Z');
export const DAY_MS = 24 * 60 * 60 * 1000;
export const LINK = 'https://claude.com/cai/oauth/authorize?state=abc';
export const plain = escapeTelegramMarkdown;
export const LINK_MESSAGE = `${plain('Open the link, log in to your Claude account, and send me the code from the page.')}\n\n${telegramLink({
    text: 'Log in to Claude',
    url: LINK,
})}`;

export const LOGGED_OUT: AuthStatus = {
    loggedIn: false,
    loginExpiresAt: null,
};

export function loggedInUntil(daysFromNow: number): AuthStatus {
    return {
        loggedIn: true,
        loginExpiresAt: new Date(NOW.getTime() + daysFromNow * DAY_MS),
    };
}

export function createSession(overrides: Partial<LoginSession> = {}): LoginSession {
    return {
        authorizationUrl: Promise.resolve(LINK),
        submitCode: vi.fn((): Promise<LoginResult> => Promise.resolve({ ok: true })),
        cancel: vi.fn(),
        ...overrides,
    };
}

// The sessions are handed out in order, to the Claude and the MCP logins alike. When they run
// out, a plain session is made.
export function setup(initialStatus: AuthStatus, sessions: LoginSession[] = [], initialMcpServers: McpServer[] = []) {
    let status = initialStatus;
    let mcpServers = initialMcpServers;
    const mcpLogins: string[] = [];
    const mcpLogouts: string[] = [];
    let storedNotices: string[] = [];
    const keyboards: (InlineKeyboardMarkup | undefined)[] = [];
    // Each editable message: the message it replies to, and its text after each write.
    const editable: { replyTo: number | undefined; texts: string[]; keyboard?: InlineKeyboardMarkup | undefined }[] = [];
    const panelEdits: { messageId: number; markdown: string; replyMarkup: InlineKeyboardMarkup | undefined }[] = [];
    let now = NOW.getTime();
    const sent: string[] = [];
    let logouts = 0;
    const assistant = createLoginAssistant({
        getAuthStatus: () => Promise.resolve(status),
        startLogin: () => sessions.shift() ?? createSession(),
        logout: () => {
            logouts++;
            status = LOGGED_OUT;

            return Promise.resolve();
        },
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
        sendEditableMarkdown: (markdown, replyToMessageId) => {
            const message: (typeof editable)[number] = {
                replyTo: replyToMessageId,
                texts: [markdown],
            };

            editable.push(message);

            return {
                edit: (edited, replyMarkup) => {
                    message.texts.push(edited);
                    message.keyboard = replyMarkup;

                    return Promise.resolve();
                },
            };
        },
        editMarkdown: (messageId, markdown, replyMarkup) => {
            panelEdits.push({
                messageId,
                markdown,
                replyMarkup,
            });

            return Promise.resolve();
        },
        now: () => new Date(now),
    });

    return {
        assistant,
        sent,
        logouts: () => logouts,
        mcpLogins,
        mcpLogouts,
        keyboards,
        editable,
        panelEdits,
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

export const DATADOG_NEEDS_LOGIN: McpServer = {
    name: 'datadog',
    status: 'Needs authentication',
    needsLogin: true,
};
export const DATADOG_CONNECTED: McpServer = {
    name: 'datadog',
    status: 'Connected',
    needsLogin: false,
};
export const GRAFANA_NEEDS_LOGIN: McpServer = {
    name: 'grafana',
    status: 'Needs authentication',
    needsLogin: true,
};
export const MCP_LINK_MESSAGE = `${plain('Open the link and log in to datadog. The browser then opens a localhost page that does not load: copy its full address (it starts with http://localhost) and send it to me.')}\n\n${telegramLink({
    text: 'Log in to datadog',
    url: LINK,
})}`;
export const REDIRECT_URL = 'http://localhost:64564/callback?code=abc&state=xyz';

export function panel(servers: McpServer[], intro?: string) {
    return renderMcpPanel(servers, intro);
}

export const PANEL_ID = 77;

export function dependenciesWith(overrides: Partial<AssistantDependencies>): AssistantDependencies {
    return {
        getAuthStatus: () => Promise.resolve(loggedInUntil(30)),
        startLogin: () => createSession(),
        logout: () => Promise.resolve(),
        listMcpServers: () => Promise.resolve([DATADOG_CONNECTED]),
        startMcpLogin: () => createSession(),
        logoutMcpServer: () => Promise.resolve(),
        readMcpNotices: () => Promise.resolve([]),
        writeMcpNotices: () => Promise.resolve(),
        sendMarkdown: () => Promise.resolve(),
        sendEditableMarkdown: () => {
            return { edit: () => Promise.resolve() };
        },
        editMarkdown: () => Promise.resolve(),
        now: () => NOW,
        ...overrides,
    };
}
