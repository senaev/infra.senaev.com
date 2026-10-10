import { isVaultToolName } from 'senaev-utils/src/obsidianVaultTools/vaultToolDefinitions';
import { runToolCall } from 'senaev-utils/src/toolServer/runToolCall';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { logger } from '../logger';
import { VAULT_TOOLS } from '../vault-tools/vaultTools';
import type { VaultToolsConfig } from '../vault-tools/vaultToolsConfig';

import type { VaultServer } from './createVaultServer';

/** The vault tools behind cluster-helper's ChatGPT MCP endpoint. */
export function registerVaultToolRoutes(server: VaultServer, config: VaultToolsConfig): void {
    server.post<{ Params: { tool: string }; Body: unknown }>('/vault/:tool', async (request, reply) => {
        const { tool: name } = request.params;
        const { statusCode, body } = await runToolCall({
            name,
            logger,
            run: () => {
                if (!isVaultToolName(name)) {
                    throw new ToolError('unknown_tool', `Unknown vault tool "${name}"`);
                }

                return VAULT_TOOLS[name](config, request.body);
            },
        });

        return reply.code(statusCode).send(body);
    });
}
