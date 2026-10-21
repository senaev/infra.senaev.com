import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { VAULT_COMMAND_ARGUMENTS } from 'senaev-utils/src/obsidianVaultTools/vaultCommands';
import { createManagedToolService } from 'senaev-utils/src/toolServer/createManagedToolService';
import { runToolCall } from 'senaev-utils/src/toolServer/runToolCall';

import { readVaultFileResource } from '../vault-tools/tools/downloadTool';
import { logger } from '../logger';
import { VAULT_TOOLS } from '../vault-tools/vaultTools';
import type { VaultToolsConfig } from '../vault-tools/vaultToolsConfig';

import type { VaultServer } from './createVaultServer';

/** The vault tools behind cluster-helper's ChatGPT MCP endpoint. */
export function registerVaultToolRoutes(server: VaultServer, config: VaultToolsConfig): void {
    const service = createManagedToolService({
        backend: 'obsidian',
        logger,
        config,
        tools: VAULT_TOOLS,
        argumentKeys: (name) => VAULT_COMMAND_ARGUMENTS[name],
    });

    server.addHook('onClose', () => service.close());

    // Binary resources bypass managed JSON result quotas, but retain the same internal authentication.
    server.post<{ Body: unknown }>('/vault-file-resource', async (request, reply) => {
        const { statusCode, body } = await runToolCall({
            name: 'read_file_resource',
            logger,
            run: () => readVaultFileResource(config, request.body, createCommandExecution({ signal: AbortSignal.timeout(60_000) })),
        });

        return reply.code(statusCode).send(body);
    });

    server.post<{ Params: { tool: string }; Body: unknown }>('/vault/:tool', async (request, reply) => {
        const { tool: name } = request.params;
        const { statusCode, body } = await runToolCall({
            name,
            logger,
            run: () => service.call(name, request.body),
        });

        return reply.code(statusCode).send(body);
    });
}
