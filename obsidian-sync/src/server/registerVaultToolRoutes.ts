import { createManagedToolService } from 'senaev-utils/src/toolServer/createManagedToolService';
import { runToolCall } from 'senaev-utils/src/toolServer/runToolCall';

import { logger } from '../logger';
import { VAULT_TOOLS } from '../vault-tools/vaultTools';
import type { VaultToolsConfig } from '../vault-tools/vaultToolsConfig';
import { readVaultToolArguments } from '../vault-tools/toolArguments';

import type { VaultServer } from './createVaultServer';

/** The vault tools behind cluster-helper's ChatGPT MCP endpoint. */
export function registerVaultToolRoutes(server: VaultServer, config: VaultToolsConfig): void {
    const service = createManagedToolService({
        backend: 'obsidian',
        logger,
        config,
        tools: VAULT_TOOLS,
        readArguments: readVaultToolArguments,
    });

    server.addHook('onClose', () => service.close());

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
