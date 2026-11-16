import {
    escapeTelegramMarkdown, telegramBold,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import { mcpButtonData, type McpServer } from './mcp';

export type McpPanel = {
    markdown: string;
    replyMarkup: InlineKeyboardMarkup | undefined;
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
