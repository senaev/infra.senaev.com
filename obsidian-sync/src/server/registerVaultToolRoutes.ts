import { logger } from '../logger';
import { VAULT_TOOLS } from '../vault-tools/vaultTools';
import type { VaultToolsConfig } from '../vault-tools/vaultToolsConfig';
import { VaultToolError } from '../vault-tools/VaultToolError';

import type { VaultServer } from './createVaultServer';

/**
 * The vault tools behind cluster-helper's ChatGPT MCP endpoint. Expected failures answer
 * with their own status and a message meant for ChatGPT; anything else is a 500.
 *
 * Logs only the tool name and timing: the arguments and results hold private note text.
 */
export function registerVaultToolRoutes(server: VaultServer, config: VaultToolsConfig): void {
    server.post<{ Params: { tool: string }; Body: unknown }>('/vault/:tool', async (request, reply) => {
        const { tool: name } = request.params;
        const tool = Object.hasOwn(VAULT_TOOLS, name) ? VAULT_TOOLS[name] : undefined;

        if (tool === undefined) {
            return reply.code(404).send({
                status: 'error',
                code: 'unknown_tool',
                message: `Unknown vault tool "${name}"`,
            });
        }

        const startedAt = performance.now();

        try {
            const result = await tool(config, request.body);

            logger.info({
                tool: name,
                durationMs: Math.round(performance.now() - startedAt),
            }, '✅ Vault tool call');

            return reply.code(200).send({
                status: 'ok',
                ...result,
            });
        } catch (error) {
            if (error instanceof VaultToolError) {
                logger.info({
                    tool: name,
                    code: error.code,
                }, '⚠️ Vault tool call failed');

                return reply.code(error.httpStatus).send({
                    status: 'error',
                    code: error.code,
                    message: error.message,
                    ...error.details !== undefined && { details: error.details },
                });
            }

            logger.error({
                err: error,
                tool: name,
            }, '❌ Vault tool call crashed');

            return reply.code(500).send({
                status: 'error',
                code: 'internal_error',
                message: 'Internal Server Error',
            });
        }
    });
}
