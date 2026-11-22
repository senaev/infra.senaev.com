import {
    escapeTelegramMarkdown, telegramBold,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import { mcpButtonData, type McpServer } from './mcp';

export type McpPanel = {
    markdown: string;
    replyMarkup: InlineKeyboardMarkup | undefined;
};

const NO_MCP_SERVERS = 'Claude Code has no MCP servers. They come from claudeCode.mcp of the workspace in the Helm values.';

// One button for each server, for the action that its status needs: a connected server can be
// logged out, any other can be logged in (a failed connection may need a new login).
function serverButton(server: McpServer): InlineKeyboardButton | undefined {
    const connected = !server.needsLogin && server.status === 'Connected';
    const data = mcpButtonData(connected ? 'logout' : 'login', server.name);

    // Telegram takes up to 64 bytes of callback data.
    if (data === undefined) {
        return undefined;
    }

    if (connected) {
        return {
            text: `✅ ${server.name}: log out`,
            callback_data: data,
        };
    }

    return {
        text: `${server.needsLogin ? '🔑' : '❌'} ${server.name}: log in`,
        callback_data: data,
    };
}

// The message is only the title, after the result of the last action if there is one. The status
// of each server is on its button.
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

    const rows = servers.flatMap((server) => {
        const button = serverButton(server);

        return button === undefined ? [] : [[button]];
    });

    return {
        markdown: parts.join('\n\n'),
        replyMarkup: rows.length === 0 ? undefined : { inline_keyboard: rows },
    };
}
