import {
    describe, expect, it,
} from 'vitest';

import { renderMcpPanel } from './mcpPanel';
import {
    DATADOG_CONNECTED, GRAFANA_NEEDS_LOGIN, plain,
} from './testing/assistantFixtures';

describe('renderMcpPanel', () => {
    it('shows only the title, and one button for each server with the action that its status needs', () => {
        expect(renderMcpPanel([
            DATADOG_CONNECTED,
            GRAFANA_NEEDS_LOGIN,
            {
                name: 'obsidian',
                status: 'Failed to connect',
                needsLogin: false,
            },
        ])).toEqual({
            markdown: '**MCP servers of Claude Code**',
            replyMarkup: {
                inline_keyboard: [
                    [
                        {
                            text: '✅ datadog: log out',
                            callback_data: 'mcp:logout:datadog',
                        },
                    ],
                    [
                        {
                            text: '🔑 grafana: log in',
                            callback_data: 'mcp:login:grafana',
                        },
                    ],
                    [
                        {
                            text: '❌ obsidian: log in',
                            callback_data: 'mcp:login:obsidian',
                        },
                    ],
                ],
            },
        });
    });

    it('puts the result of the last action above the title', () => {
        expect(renderMcpPanel([DATADOG_CONNECTED], 'Logged in to datadog.').markdown).toBe(`${plain('Logged in to datadog.')}\n\n**MCP servers of Claude Code**`);
    });

    it('gives no button to a name too long for Telegram', () => {
        expect(renderMcpPanel([
            {
                name: 'x'.repeat(60),
                status: 'Connected',
                needsLogin: false,
            },
        ]).replyMarkup).toBeUndefined();
    });

    it('says where the servers come from when there are none', () => {
        expect(renderMcpPanel([])).toEqual({
            markdown: plain('Claude Code has no MCP servers. They come from agent.mcp of the workspace in the Helm values.'),
            replyMarkup: undefined,
        });
    });
});
