import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';

import type { AuthStatus } from './claude';
import { logger } from './logger';
import type { LoginResult, LoginSession } from './login';
import type { McpServer } from './mcp';

export type AssistantDependencies = {
    getAuthStatus(): Promise<AuthStatus>;
    startLogin(): LoginSession;
    listMcpServers(): Promise<McpServer[]>;
    startMcpLogin(serverName: string): LoginSession;
    // Telegram Rich Markdown.
    sendMarkdown(markdown: string): Promise<void>;
    now(): Date;
};

export type LoginAssistant = {
    handleAuthCommand(): Promise<void>;
    // Without a name: the list of MCP servers. With a name: a login link for that server.
    handleMcpCommand(serverName: string): Promise<void>;
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

function describeMcpServers(servers: McpServer[]): string {
    return servers.map(({ name, status }) => `• ${name}: ${status}`).join('\n');
}

export function createLoginAssistant(dependencies: AssistantDependencies): LoginAssistant {
    let pending: PendingLogin | null = null;
    let loggedOutNoticeSent = false;
    // The MCP servers that the user was already told about.
    const mcpLoginNoticesSent = new Set<string>();
    let lastExpiryNoticeAt: number | null = null;

    function sendText(text: string): Promise<void> {
        return dependencies.sendMarkdown(escapeTelegramMarkdown(text));
    }

    function cancelSession(): void {
        pending?.session.cancel();
        pending = null;
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

        await sendText(`The login failed: ${reason}\nSend /auth to try again.`);
    }

    async function reportMcpLoginResult(serverName: string, result: LoginResult): Promise<void> {
        if (!result.ok) {
            await sendText(`The login to ${serverName} failed: ${result.reason}\nSend /mcp ${serverName} to try again.`);

            return;
        }

        const server = (await dependencies.listMcpServers()).find(({ name }) => name === serverName);

        if (server === undefined || server.needsLogin) {
            await sendText(`The login command finished, but ${serverName} still needs a login (${server?.status ?? 'not in the list'}).\nSend /mcp ${serverName} to try again.`);

            return;
        }

        mcpLoginNoticesSent.delete(serverName);
        await sendText(`Logged in to ${serverName}: ${server.status}. New Claude Code sessions can use it.`);
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
            const servers = await dependencies.listMcpServers();

            if (servers.length === 0) {
                await sendText('Claude Code has no MCP servers. They come from agent.mcp of the workspace in the Helm values.');

                return;
            }

            if (serverName === '') {
                await sendText(`MCP servers of Claude Code:\n${describeMcpServers(servers)}\n\nSend /mcp <name> to log in to one.`);

                return;
            }

            if (!servers.some(({ name }) => name === serverName)) {
                await sendText(`There is no MCP server ${serverName}. The servers are:\n${describeMcpServers(servers)}`);

                return;
            }

            await beginMcpLogin(serverName);
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
            const needLogin = servers.filter(({ name, needsLogin }) => needsLogin && !mcpLoginNoticesSent.has(name));

            for (const { name, needsLogin } of servers) {
                if (!needsLogin) {
                    mcpLoginNoticesSent.delete(name);
                }
            }

            if (needLogin.length === 0) {
                return;
            }

            const names = needLogin.map(({ name }) => name);

            await sendText(`These MCP servers of Claude Code need a login: ${names.join(', ')}. Send /mcp <name> to log in.`);

            for (const name of names) {
                mcpLoginNoticesSent.add(name);
            }
        },

        stop() {
            cancelSession();
        },
    };
}
