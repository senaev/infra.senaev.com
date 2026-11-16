import {
    describe, expect, it,
} from 'vitest';

import { renderMcpPanel } from './mcpPanel';
import {
    DATADOG_CONNECTED, GRAFANA_NEEDS_LOGIN, plain,
} from './testing/assistantFixtures';

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
