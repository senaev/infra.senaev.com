import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { escapeTelegramMarkdown, telegramLink } from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import { logger } from './logger';
import type { LoginResult, LoginSession } from './login';
import type { McpButtonAction, McpServer } from './mcp';
import { type McpPanel, renderMcpPanel } from './mcpPanel';
import type { PendingLoginSlot } from './pendingLogin';

// A message that the bot posted and can rewrite. Its writes are serialized.
export type EditableMessage = {
    edit(markdown: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
};

export type McpDialogDependencies = {
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
};

// The MCP panel works like the torrent search in cluster-helper: a button press is answered with
// a short notice, the panel is rewritten in place, and a login reports into its own message.
export type McpDialog = {
    // Posts the panel: the servers with their status, and a login and a logout button each.
    handleMcpCommand(): Promise<void>;
    // A button of the panel with `panelMessageId`; undefined when Telegram no longer gives the
    // message. Returns the short notice that answers the button press.
    handleMcpButton(action: McpButtonAction, serverName: string, panelMessageId: number | undefined): Promise<string>;
    // Posts the panel once when a server needs a login, until it is logged in and loses it again.
    checkMcpServers(): Promise<void>;
};

export function createMcpDialog(dependencies: McpDialogDependencies, slot: PendingLoginSlot): McpDialog {
    // The servers that the user was already told about, read from the store on first use.
    let notices: Set<string> | null = null;

    function editLinkMessage(message: EditableMessage, text: string): Promise<void> {
        return message.edit(escapeTelegramMarkdown(text)).catch((error: unknown) => {
            logger.warn({ err: error }, '⚠️ Could not edit the message with the MCP login link');
        });
    }

    async function getNotices(): Promise<Set<string>> {
        notices ??= new Set(await dependencies.readMcpNotices());

        return notices;
    }

    async function updateNotices(change: (current: Set<string>) => void): Promise<void> {
        const current = await getNotices();
        const before = [...current].sort().join(',');

        change(current);

        if ([...current].sort().join(',') !== before) {
            await dependencies.writeMcpNotices([...current].sort());
        }
    }

    // The panel with the current status of the servers. When they cannot be listed, a text that
    // says so, without buttons.
    async function buildPanel(intro?: string): Promise<McpPanel> {
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

    // Posts a new panel when there is no message to rewrite.
    async function refreshPanel(panelMessageId: number | undefined, intro?: string): Promise<void> {
        const { markdown, replyMarkup } = await buildPanel(intro);

        await (panelMessageId === undefined
            ? dependencies.sendMarkdown(markdown, replyMarkup)
            : dependencies.editMarkdown(panelMessageId, markdown, replyMarkup));
    }

    async function reportLoginResult(
        serverName: string,
        linkMessage: EditableMessage,
        panelMessageId: number | undefined,
        result: LoginResult
    ): Promise<void> {
        if (!result.ok) {
            await editLinkMessage(linkMessage, `❌ The login to ${serverName} failed: ${result.reason}`);
            await refreshPanel(panelMessageId);

            return;
        }

        let server: McpServer | undefined;

        try {
            server = (await dependencies.listMcpServers()).find(({ name }) => name === serverName);
        } catch (error) {
            await editLinkMessage(linkMessage, `The login command for ${serverName} finished, but the MCP servers could not be listed: ${stringifyUnknownError(error)}. Send /mcp to see them.`);

            return;
        }

        if (server === undefined || server.needsLogin) {
            await editLinkMessage(linkMessage, `❌ The login command finished, but ${serverName} still needs a login.`);
        } else {
            await updateNotices((current) => current.delete(serverName));
            await editLinkMessage(linkMessage, `✅ Logged in to ${serverName}. New Claude Code sessions can use it.`);
        }

        await refreshPanel(panelMessageId);
    }

    // The link goes into its own message, a reply to the panel, so the panel keeps its buttons.
    async function beginLogin(serverName: string, panelMessageId: number | undefined): Promise<string> {
        // The previous login stops before the next command starts.
        slot.cancel();
        const session = dependencies.startMcpLogin(serverName);
        const linkMessage = dependencies.sendEditableMarkdown(escapeTelegramMarkdown(`⏳ Starting the login to ${serverName}…`), panelMessageId);

        slot.begin({
            session,
            mcpServerName: serverName,
            report: (result) => reportLoginResult(serverName, linkMessage, panelMessageId, result),
            // The link of a stopped login does not work any more, so it does not stay in the chat.
            onCancel: () => {
                void editLinkMessage(linkMessage, `⏹ The login to ${serverName} was stopped.`);
            },
        });

        try {
            const url = await session.authorizationUrl;
            const intro = escapeTelegramMarkdown(`Open the link and log in to ${serverName}. The browser then opens a localhost page that does not load: copy its full address (it starts with http://localhost) and send it to me.`);

            await linkMessage.edit(`${intro}\n\n${telegramLink({
                text: `Log in to ${serverName}`,
                url,
            })}`);

            return '🔑 The login link is in the chat';
        } catch (error) {
            if (slot.current()?.session === session) {
                slot.take();
            }

            session.cancel();
            await editLinkMessage(linkMessage, `❌ Could not start the login to ${serverName}: ${stringifyUnknownError(error)}`);

            return '❌ The login did not start';
        }
    }

    async function logout(serverName: string, panelMessageId: number | undefined): Promise<string> {
        // A login of this server that waits for its redirect URL would sign it in again.
        if (slot.current()?.mcpServerName === serverName) {
            slot.cancel();
        }

        try {
            await dependencies.logoutMcpServer(serverName);
        } catch (error) {
            await refreshPanel(panelMessageId, `❌ Could not log out of ${serverName}: ${stringifyUnknownError(error)}`);

            return '❌ The logout failed';
        }

        // The user logged out on purpose: no notice that it needs a login.
        await updateNotices((current) => current.add(serverName));
        await refreshPanel(panelMessageId, `🚪 Logged out of ${serverName}.`);

        return '🚪 Logged out';
    }

    return {
        async handleMcpCommand() {
            // The servers take a few seconds to check, so the message is there at once.
            const message = dependencies.sendEditableMarkdown(escapeTelegramMarkdown('⏳ Checking the MCP servers…'));
            const { markdown, replyMarkup } = await buildPanel();

            await message.edit(markdown, replyMarkup);
        },

        handleMcpButton(action, serverName, panelMessageId) {
            return action === 'login' ? beginLogin(serverName, panelMessageId) : logout(serverName, panelMessageId);
        },

        async checkMcpServers() {
            const servers = await dependencies.listMcpServers();
            const current = await getNotices();
            const newlyNeedLogin = servers.filter(({ name, needsLogin }) => needsLogin && !current.has(name)).map(({ name }) => name);

            if (newlyNeedLogin.length > 0) {
                const { markdown, replyMarkup } = renderMcpPanel(servers, `⚠️ Some MCP servers of Claude Code need a login: ${newlyNeedLogin.join(', ')}.`);

                await dependencies.sendMarkdown(markdown, replyMarkup);
            }

            // Exactly the servers that need a login now: one that is logged in and loses it again
            // gets a new notice. Recorded after the message, so a failed send is tried again.
            await updateNotices((stored) => {
                stored.clear();

                for (const { name, needsLogin } of servers) {
                    if (needsLogin) {
                        stored.add(name);
                    }
                }
            });
        },
    };
}
