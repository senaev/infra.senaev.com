import {
    describe, expect, it,
} from 'vitest';

import type { CommandRunner } from './claude';
import {
    listMcpServers, MCP_LOGIN_REJECTION_PATTERN, parseMcpList,
} from './mcp';

// The output of `claude mcp list` of Claude Code 2.1.325.
const OUTPUT = [
    'Checking MCP server health…',
    '',
    'datadog: https://mcp.datadoghq.eu/v1/mcp?toolsets=core,software-delivery (HTTP) - ! Needs authentication',
    'grafana: https://mcp.senaev.com/grafana (HTTP) - ✓ Connected',
    'my-server: https://example.com/a-b - c (HTTP) - \u001b[31m✗ Failed to connect\u001b[39m',
    '',
].join('\n');

describe('parseMcpList', () => {
    it('reads the name and the status of each server', () => {
        expect(parseMcpList(OUTPUT)).toEqual([
            {
                name: 'datadog',
                status: 'Needs authentication',
                needsLogin: true,
            },
            {
                name: 'grafana',
                status: 'Connected',
                needsLogin: false,
            },
            {
                name: 'my-server',
                status: 'Failed to connect',
                needsLogin: false,
            },
        ]);
    });

    it('gives no servers when none are configured', () => {
        expect(parseMcpList('No MCP servers configured. Use `claude mcp add` to add a server.\n')).toEqual([]);
    });
});

describe('listMcpServers', () => {
    it('fails when the command fails', async () => {
        const run: CommandRunner = () => Promise.resolve({
            stdout: '',
            exitCode: 1,
        });

        await expect(listMcpServers(run)).rejects.toThrow('exit code 1');
    });
});

describe('MCP_LOGIN_REJECTION_PATTERN', () => {
    it('matches the line that claude mcp login prints for a wrong redirect URL', () => {
        const output = 'Or paste the redirect URL here: http://localhost:1234/callback?code=bad&state=wrong\r\n' + 'That doesn\'t look like a redirect URL for this sign-in — paste the full address from the browser page this sign-in opened.\r\n';

        expect(MCP_LOGIN_REJECTION_PATTERN.exec(output)?.[0].trim()).toBe('That doesn\'t look like a redirect URL for this sign-in — paste the full address from the browser page this sign-in opened.');
    });
});
