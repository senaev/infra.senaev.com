import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import {
    escapeTelegramMarkdown, telegramBold, telegramLink,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import type { AuthStatus } from './claude';
import { logger } from './logger';
import type { LoginResult, LoginSession } from './login';
import {
    mcpButtonData, type McpButtonAction, type McpServer,
} from './mcp';

export type AssistantDependencies = {
    getAuthStatus(): Promise<AuthStatus>;
    startLogin(): LoginSession;
    listMcpServers(): Promise<McpServer[]>;
    startMcpLogin(serverName: string): LoginSession;
    logoutMcpServer(serverName: string): Promise<void>;
    // The MCP servers that the user was told need a login. Kept across restarts, so a deploy
    // does not repeat the notice.
    readMcpNotices(): Promise<string[]>;
    writeMcpNotices(serverNames: string[]): Promise<void>;
    // Telegram Rich Markdown.
    sendMarkdown(markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    now(): Date;
};

export type LoginAssistant = {
    handleAuthCommand(): Promise<void>;
    // Without a name: the MCP servers with their status and buttons. With a name: a login link.
    handleMcpCommand(serverName: string): Promise<void>;
    handleMcpButton(action: McpButtonAction, serverName: string): Promise<void>;
    // Returns true when the text was taken as a login code or a redirect URL, so the caller can
    // delete the message.
    handleText(text: string): Promise<boolean>;
    checkLogin(): Promise<void>;
    // Says once when an MCP server needs a login, until it is logged in and loses it again.
    checkMcpServers(): Promise<void>;
    stop(): void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const EXPIRY_WARNING_MS = 5 * DAY_MS;
export const EXPIRY_NOTICE_REPEAT_MS = DAY_MS;

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// One login waits for an answer at a time: a new one cancels the previous one.
type PendingLogin = {
    session: LoginSession;
    // null is the Claude login; a name is the login of that MCP server.
    mcpServerName: string | null;
};

const NO_MCP_SERVERS = 'Claude Code has no MCP servers. They come from agent.mcp of the workspace in the Helm values.';

function statusIcon({ status, needsLogin }: McpServer): string {
    if (needsLogin) {
        return '🔑';
    }

    return status === 'Connected' ? '✅' : '❌';
}

// Rich Markdown joins lines that a single line break separates, so the parts are paragraphs
// and the servers a list. Each server has a row with a login and a logout button.
export function renderMcpPanel(servers: McpServer[], intro?: string): {
    markdown: string;
    replyMarkup: InlineKeyboardMarkup | undefined;
} {
    const parts = intro === undefined ? [] : [escapeTelegramMarkdown(intro)];

    if (servers.length === 0) {
        parts.push(escapeTelegramMarkdown(NO_MCP_SERVERS));

        return {
            markdown: parts.join('\n\n'),
            replyMarkup: undefined,
        };
    }

    parts.push(telegramBold('MCP servers of Claude Code'));
    parts.push(servers.map((server) => `- ${statusIcon(server)} ${escapeTelegramMarkdown(`${server.name}: ${server.status}`)}`).join('\n'));

    const rows = servers.flatMap(({ name }): InlineKeyboardButton[][] => {
        const login = mcpButtonData('login', name);
        const logout = mcpButtonData('logout', name);

        // Telegram takes up to 64 bytes of callback data; such a name can still use /mcp <name>.
        return login === undefined || logout === undefined
            ? []
            : [
                [
                    {
                        text: `🔑 Log in: ${name}`,
                        callback_data: login,
                    },
                    {
                        text: `🚪 Log out: ${name}`,
                        callback_data: logout,
                    },
                ],
            ];
    });

    return {
        markdown: parts.join('\n\n'),
        replyMarkup: rows.length === 0 ? undefined : { inline_keyboard: rows },
    };
}

export function createLoginAssistant(dependencies: AssistantDependencies): LoginAssistant {
    let pending: PendingLogin | null = null;
    let loggedOutNoticeSent = false;
    // The MCP servers that the user was already told about, read from the store on first use.
    let mcpNotices: Set<string> | null = null;
    let lastExpiryNoticeAt: number | null = null;

    function sendText(text: string): Promise<void> {
        return dependencies.sendMarkdown(escapeTelegramMarkdown(text));
    }

    function cancelSession(): void {
        pending?.session.cancel();
        pending = null;
    }

    async function getMcpNotices(): Promise<Set<string>> {
        mcpNotices ??= new Set(await dependencies.readMcpNotices());

        return mcpNotices;
    }

    async function updateMcpNotices(change: (notices: Set<string>) => void): Promise<void> {
        const notices = await getMcpNotices();
        const before = [...notices].sort().join(',');

        change(notices);

        if ([...notices].sort().join(',') !== before) {
            await dependencies.writeMcpNotices([...notices].sort());
        }
    }

    function sendMcpPanel(servers: McpServer[], intro?: string): Promise<void> {
        const { markdown, replyMarkup } = renderMcpPanel(servers, intro);

        return dependencies.sendMarkdown(markdown, replyMarkup);
    }

    // Lists the servers again, so the panel shows their status after the change.
    async function listAndSendMcpPanel(intro?: string): Promise<void> {
        let servers: McpServer[];

        try {
            servers = await dependencies.listMcpServers();
        } catch (error) {
            const failure = `Could not list the MCP servers: ${stringifyUnknownError(error)}. Send /mcp to try again.`;

            await sendText(intro === undefined ? failure : `${intro}\n\n${failure}`);

            return;
        }

        await sendMcpPanel(servers, intro);
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

    async function reportMcpLoginResult(serverName: string, result: LoginResult): Promise<void> {
        if (!result.ok) {
            await listAndSendMcpPanel(`The login to ${serverName} failed: ${result.reason}`);

            return;
        }

        let servers: McpServer[];

        try {
            servers = await dependencies.listMcpServers();
        } catch (error) {
            await sendText(`The login command for ${serverName} finished, but the MCP servers could not be listed: ${stringifyUnknownError(error)}. Send /mcp to see them.`);

            return;
        }

        const server = servers.find(({ name }) => name === serverName);

        if (server === undefined || server.needsLogin) {
            await sendMcpPanel(servers, `The login command finished, but ${serverName} still needs a login.`);

            return;
        }

        await updateMcpNotices((notices) => notices.delete(serverName));
        await sendMcpPanel(servers, `Logged in to ${serverName}. New Claude Code sessions can use it.`);
    }

    async function beginMcpLogin(serverName: string): Promise<void> {
        cancelSession();
        const newSession = dependencies.startMcpLogin(serverName);

        pending = {
            session: newSession,
            mcpServerName: serverName,
        };

        try {
            const url = await newSession.authorizationUrl;
            const intro = escapeTelegramMarkdown(`Open the link and log in to ${serverName}. The browser then opens a localhost page that does not load: copy its full address (it starts with http://localhost) and send it to me.`);

            await dependencies.sendMarkdown(`${intro}\n\n${telegramLink({
                text: `Log in to ${serverName}`,
                url,
            })}`);
        } catch (error) {
            cancelSession();
            await sendText(`Could not start the login to ${serverName}: ${stringifyUnknownError(error)}`);
        }
    }

    async function logoutMcpServer(serverName: string): Promise<void> {
        // A login of this server that waits for its redirect URL would sign it in again.
        if (pending?.mcpServerName === serverName) {
            cancelSession();
        }

        try {
            await dependencies.logoutMcpServer(serverName);
        } catch (error) {
            await listAndSendMcpPanel(`Could not log out of ${serverName}: ${stringifyUnknownError(error)}`);

            return;
        }

        // The user logged out on purpose: no notice that it needs a login.
        await updateMcpNotices((notices) => notices.add(serverName));
        await listAndSendMcpPanel(`Logged out of ${serverName}.`);
    }

    // A login that waits for an answer stays when the servers cannot be listed: it is cancelled
    // only when a new one starts.
    async function startMcpAction(action: McpButtonAction, serverName: string): Promise<void> {
        let servers: McpServer[];

        try {
            servers = await dependencies.listMcpServers();
        } catch (error) {
            await sendText(`Could not list the MCP servers: ${stringifyUnknownError(error)}. Send /mcp to try again.`);

            return;
        }

        if (!servers.some(({ name }) => name === serverName)) {
            await sendMcpPanel(servers, `There is no MCP server ${serverName}.`);

            return;
        }

        await (action === 'login' ? beginMcpLogin(serverName) : logoutMcpServer(serverName));
    }

    async function beginLogin(): Promise<void> {
        cancelSession();
        const newSession = dependencies.startLogin();

        pending = {
            session: newSession,
            mcpServerName: null,
        };

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

        async handleMcpCommand(serverName) {
            await (serverName === '' ? listAndSendMcpPanel() : startMcpAction('login', serverName));
        },

        async handleMcpButton(action, serverName) {
            await startMcpAction(action, serverName);
        },

        async handleText(text) {
            const waiting = pending;

            if (waiting === null) {
                await sendText('No login is waiting for a code. Send /auth or /mcp to start one.');

                return false;
            }

            pending = null;
            const result = await waiting.session.submitCode(text.trim());

            // The text was taken as a code, so the caller must get `true` and delete the message,
            // also when the status or the answer to the user fails.
            try {
                await (waiting.mcpServerName === null
                    ? reportLoginResult(result)
                    : reportMcpLoginResult(waiting.mcpServerName, result));
            } catch (error) {
                logger.error(error, '❌ Could not report the result of the login');
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
                const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));

                await sendText(`The Claude login expires on ${formatDate(status.loginExpiresAt)} (in ${daysLeft} days). Send /auth to renew it.`);
                lastExpiryNoticeAt = now;
            }
        },

        async checkMcpServers() {
            const servers = await dependencies.listMcpServers();
            const notices = await getMcpNotices();
            const newlyNeedLogin = servers.filter(({ name, needsLogin }) => needsLogin && !notices.has(name)).map(({ name }) => name);

            if (newlyNeedLogin.length > 0) {
                await sendMcpPanel(servers, `Some MCP servers of Claude Code need a login: ${newlyNeedLogin.join(', ')}.`);
            }

            // Exactly the servers that need a login now: one that is logged in and loses it again
            // gets a new notice. Recorded after the message, so a failed send is tried again.
            await updateMcpNotices((current) => {
                current.clear();

                for (const { name, needsLogin } of servers) {
                    if (needsLogin) {
                        current.add(name);
                    }
                }
            });
        },

        stop() {
            cancelSession();
        },
    };
}
