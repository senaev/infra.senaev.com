import type { FastifyInstance } from 'fastify';
import { CODE_COMMAND_ARGUMENTS } from 'senaev-utils/src/codeTools/codeCommands';
import { createManagedToolService } from 'senaev-utils/src/toolServer/createManagedToolService';
import { runToolCall } from 'senaev-utils/src/toolServer/runToolCall';

import { logger } from '../logger';
import { CODE_TOOLS } from '../tools/codeTools';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

/**
 * The tools give a full shell in the container, so these routes must exist only on the mTLS
 * instance, behind the caller allowlist.
 */
export function registerCodeToolsRoutes(
    server: Pick<FastifyInstance, 'addHook' | 'post'>,
    config: CodeToolsConfig
): void {
    const service = createManagedToolService({
        backend: 'code',
        logger,
        config,
        tools: CODE_TOOLS,
        argumentKeys: (name) => CODE_COMMAND_ARGUMENTS[name],
    });

    server.addHook('onClose', () => service.close());

    server.post<{ Params: { tool: string }; Body: unknown }>('/code/:tool', async (request, reply) => {
        const { tool: name } = request.params;
        const { statusCode, body } = await runToolCall({
            name,
            logger,
            run: () => service.call(name, request.body),
        });

        return reply.code(statusCode).send(body);
    });
}
