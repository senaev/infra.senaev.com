import { OperationManager } from 'senaev-utils/src/operations/OperationManager';
import { isOperationToolName, readOperationArguments } from 'senaev-utils/src/operations/operationToolDefinitions';
import { isVaultToolName } from 'senaev-utils/src/obsidianVaultTools/vaultToolDefinitions';
import { runToolCall } from 'senaev-utils/src/toolServer/runToolCall';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { logger } from '../logger';
import { VAULT_TOOLS } from '../vault-tools/vaultTools';
import type { VaultToolsConfig } from '../vault-tools/vaultToolsConfig';
import { readVaultToolArguments } from '../vault-tools/toolArguments';

import type { VaultServer } from './createVaultServer';

/** The vault tools behind cluster-helper's ChatGPT MCP endpoint. */
export function registerVaultToolRoutes(server: VaultServer, config: VaultToolsConfig): void {
    const manager = new OperationManager('obsidian', (error, operation) => {
        logger.error({
            err: error,
            ...operation,
        }, 'Managed operation crashed');
    });

    server.addHook('onClose', () => manager.close());

    server.post<{ Params: { tool: string }; Body: unknown }>('/vault/:tool', async (request, reply) => {
        const { tool: name } = request.params;
        const { statusCode, body } = await runToolCall({
            name,
            logger,
            run: () => {
                if (isOperationToolName(name)) {
                    return manager.control(name, readOperationArguments(name, request.body));
                }

                if (!isVaultToolName(name)) {
                    throw new ToolError('unknown_tool', `Unknown vault tool "${name}"`);
                }

                const args = readVaultToolArguments(request.body, name);

                return manager.launch({
                    tool: name,
                    args,
                    run: () => VAULT_TOOLS[name](config, args),
                });
            },
        });

        return reply.code(statusCode).send(body);
    });
}
