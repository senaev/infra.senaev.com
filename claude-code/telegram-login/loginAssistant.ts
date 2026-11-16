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

// A message that the bot posted and can rewrite. Its writes are serialized.
export type EditableMessage = {
    edit(markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
};

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
    // All text is Telegram Rich Markdown.
    sendMarkdown(markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    // Returns at once, while the message is still being posted.
    sendEditableMarkdown(markdown: string, replyToMessageId?: number): EditableMessage;
    editMarkdown(messageId: number, markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    now(): Date;
};

export type LoginAssistant = {
    handleAuthCommand(): Promise<void>;
    // Posts the MCP panel: the servers with their status, and a login and a logout button each.
    handleMcpCommand(): Promise<void>;
    // A button of the panel with `panelMessageId`; undefined when Telegram no longer gives the
    // message. Returns the short notice that answers the button press.
    handleMcpButton(action: McpButtonAction, serverName: string, panelMessageId: number | undefined): Promise<string>;
    // Returns true when the text was taken as a login code or a redirect URL, so the caller can
    // delete the message.
    handleText(text: string): Promise<boolean>;
    checkLogin(): Promise<void>;
    // Posts the panel once when an MCP server needs a login, until it is logged in and loses it again.
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
} & ({ mcpServerName: null } | {
    mcpServerName: string;
    // The reply to the panel with the link; it ends with the result.
    linkMessage: EditableMessage;
    panelMessageId: number | undefined;
});

const NO_MCP_SERVERS = 'Claude Code has no MCP servers. They come from agent.mcp of the workspace in the Helm values.';

function statusIcon({ status, needsLogin }: McpServer): string {
    if (needsLogin) {
        return '🔑';
    }

    return status === 'Connected' ? '✅' : '❌';
}

export type McpPanel = {
    markdown: string;
    replyMarkup: InlineKeyboardMarkup | undefined;
};

// Rich Markdown joins lines that a single line break separates, so the parts are paragraphs
// and the servers a list. Each server has a row with a login and a logout button.
export function renderMcpPanel(servers: McpServer[], intro?: string): McpPanel {
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

        // Telegram takes up to 64 bytes of callback data.
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

    function editLinkMessage(message: EditableMessage, text: string): Promise<void> {
        return message.edit(escapeTelegramMarkdown(text)).catch((error: unknown) => {
            logger.warn({ err: error }, '⚠️ Could not edit the message with the MCP login link');
        });
    }

    function cancelSession(): void {
        const cancelled = pending;

        pending = null;
        cancelled?.session.cancel();

        // The link of a cancelled login does not work any more, so it does not stay in the chat.
        if (cancelled !== null && cancelled.mcpServerName !== null) {
            void editLinkMessage(cancelled.linkMessage, `⏹ The login to ${cancelled.mcpServerName} was stopped.`);
        }
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

    // The panel with the current status of the servers. When they cannot be listed, a text that
    // says so, without buttons.
    async function buildMcpPanel(intro?: string): Promise<McpPanel> {
        try {
            return renderMcpPanel(await dependencies.listMcpServers(), intro);
        } catch (error) {
            const failure = `Could not list the MCP servers: ${stringifyUnknownError(error)}. Send /mcp to try again.`;

            return {
                markdown: escapeTelegramMarkdown(intro === undefined ? failure : `${intro}\n\n${failure}`),
                replyMarkup: undefined,
            };
        }
    }

    // Rewrites the panel in place, as a torrent search does; posts a new one when there is no
    // message to rewrite.
    async function refreshMcpPanel(panelMessageId: number | undefined, intro?: string): Promise<void> {
        const { markdown, replyMarkup } = await buildMcpPanel(intro);

        await (panelMessageId === undefined
            ? dependencies.sendMarkdown(markdown, replyMarkup)
            : dependencies.editMarkdown(panelMessageId, markdown, replyMarkup));
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

    async function reportMcpLoginResult(
        login: Extract<PendingLogin, { linkMessage: EditableMessage }>,
        result: LoginResult
    ): Promise<void> {
        const serverName = login.mcpServerName;

        if (!result.ok) {
            await editLinkMessage(login.linkMessage, `❌ The login to ${serverName} failed: ${result.reason}`);
            await refreshMcpPanel(login.panelMessageId);

            return;
        }

        let server: McpServer | undefined;

        try {
            server = (await dependencies.listMcpServers()).find(({ name }) => name === serverName);
        } catch (error) {
            await editLinkMessage(login.linkMessage, `The login command for ${serverName} finished, but the MCP servers could not be listed: ${stringifyUnknownError(error)}. Send /mcp to see them.`);

            return;
        }

        if (server === undefined || server.needsLogin) {
            await editLinkMessage(login.linkMessage, `❌ The login command finished, but ${serverName} still needs a login.`);
        } else {
            await updateMcpNotices((notices) => notices.delete(serverName));
            await editLinkMessage(login.linkMessage, `✅ Logged in to ${serverName}. New Claude Code sessions can use it.`);
        }

        await refreshMcpPanel(login.panelMessageId);
    }

    // The link goes into its own message, a reply to the panel, so the panel keeps its buttons.
    async function beginMcpLogin(serverName: string, panelMessageId: number | undefined): Promise<string> {
        cancelSession();
        const newSession = dependencies.startMcpLogin(serverName);
        const linkMessage = dependencies.sendEditableMarkdown(escapeTelegramMarkdown(`⏳ Starting the login to ${serverName}…`), panelMessageId);

        pending = {
            session: newSession,
            mcpServerName: serverName,
            linkMessage,
            panelMessageId,
        };

        try {
            const url = await newSession.authorizationUrl;
            const intro = escapeTelegramMarkdown(`Open the link and log in to ${serverName}. The browser then opens a localhost page that does not load: copy its full address (it starts with http://localhost) and send it to me.`);

            await linkMessage.edit(`${intro}\n\n${telegramLink({
                text: `Log in to ${serverName}`,
                url,
            })}`);

            return '🔑 The login link is in the chat';
        } catch (error) {
            if (pending?.session === newSession) {
                pending = null;
            }

            newSession.cancel();
            await editLinkMessage(linkMessage, `❌ Could not start the login to ${serverName}: ${stringifyUnknownError(error)}`);

            return '❌ The login did not start';
        }
    }

    async function logoutMcpServer(serverName: string, panelMessageId: number | undefined): Promise<string> {
        // A login of this server that waits for its redirect URL would sign it in again.
        if (pending?.mcpServerName === serverName) {
            cancelSession();
        }

        try {
            await dependencies.logoutMcpServer(serverName);
        } catch (error) {
            await refreshMcpPanel(panelMessageId, `❌ Could not log out of ${serverName}: ${stringifyUnknownError(error)}`);

            return '❌ The logout failed';
        }

        // The user logged out on purpose: no notice that it needs a login.
        await updateMcpNotices((notices) => notices.add(serverName));
        await refreshMcpPanel(panelMessageId, `🚪 Logged out of ${serverName}.`);

        return '🚪 Logged out';
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

        async handleMcpCommand() {
            // The servers take a few seconds to check, so the message is there at once.
            const message = dependencies.sendEditableMarkdown(escapeTelegramMarkdown('⏳ Checking the MCP servers…'));
            const { markdown, replyMarkup } = await buildMcpPanel();

            await message.edit(markdown, replyMarkup);
        },

        handleMcpButton(action, serverName, panelMessageId) {
            return action === 'login'
                ? beginMcpLogin(serverName, panelMessageId)
                : logoutMcpServer(serverName, panelMessageId);
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
                    : reportMcpLoginResult(waiting, result));
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
                const { markdown, replyMarkup } = renderMcpPanel(servers, `⚠️ Some MCP servers of Claude Code need a login: ${newlyNeedLogin.join(', ')}.`);

                await dependencies.sendMarkdown(markdown, replyMarkup);
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
