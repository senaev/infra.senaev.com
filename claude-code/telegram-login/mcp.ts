import type { CommandRunner } from './claude';

export type McpServer = {
    name: string;
    // As the CLI prints it, without the leading symbol: "Connected", "Needs authentication"...
    status: string;
    needsLogin: boolean;
};

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\u001b\[[0-9;?]*[A-Za-z]/g;
// "datadog: https://mcp.datadoghq.eu/v1/mcp (HTTP) - ! Needs authentication". The last " - "
// separates the status, so a dash in the URL does not matter.
const SERVER_LINE = /^([\w-]+): .* - (?:[^\p{L}\p{N}\s]+\s+)?(.+)$/u;
const NEEDS_LOGIN = /needs authentication/i;

// The prompt `claude mcp login` shows again after a redirect URL that it does not accept.
export const MCP_LOGIN_REJECTION_PATTERN = /^.*doesn't look like a redirect URL.*$/m;

export function parseMcpList(stdout: string): McpServer[] {
    return stdout
        .replace(ANSI_ESCAPE, '')
        .split('\n')
        .map((line) => SERVER_LINE.exec(line.trim()))
        .filter((match) => match !== null)
        .map(([
            , name = '',
            status = '',
        ]) => {
            return {
                name,
                status: status.trim(),
                needsLogin: NEEDS_LOGIN.test(status),
            };
        });
}

// The servers come from the user config in HOME, which start.sh writes. The command checks the
// health of every server, so it takes a few seconds.
export async function listMcpServers(run: CommandRunner): Promise<McpServer[]> {
    const { stdout, exitCode } = await run('claude', [
        'mcp',
        'list',
    ]);

    if (exitCode !== 0) {
        throw new Error(`claude mcp list failed with exit code ${exitCode}`);
    }

    return parseMcpList(stdout);
}
