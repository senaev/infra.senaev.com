import { ResourceReadGate } from 'senaev-utils/src/toolServer/ResourceReadGate';
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

    const resourceReads = new ResourceReadGate();

    // Binary resources bypass managed JSON result quotas, but retain the same internal authentication.
    server.post<{ Body: unknown }>('/vault-file-resource', async (request, reply) => {
        const transfer = resourceReads.begin(reply.raw, 60_000);

        if (transfer === null) {
            return reply.code(429).header('Retry-After', '1').send({
                status: 'error',
                code: 'resource_busy',
                message: 'Another file transfer is active; retry shortly',
            });
        }

        try {
            const { statusCode, body } = await runToolCall({
                name: 'read_file_resource',
                logger,
                run: () => readVaultFileResource(config, request.body, createCommandExecution({ signal: transfer.signal })),
            });

            return reply.code(statusCode).send(body);
        } finally {
            transfer.finish();
        }
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
