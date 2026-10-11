import Fastify from 'fastify';
import { isCodeToolName, isManagedCodeToolName } from 'senaev-utils/src/codeTools/codeToolDefinitions';
import { OperationManager } from 'senaev-utils/src/operations/OperationManager';
import { isOperationToolName, readOperationArguments } from 'senaev-utils/src/operations/operationToolDefinitions';
import { isValidBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import { runToolCall } from 'senaev-utils/src/toolServer/runToolCall';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { logger } from '../logger';
import { CODE_TOOLS } from '../tools/codeTools';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';
import { readCodeToolArguments } from '../tools/projectAccess';

// code-write accepts up to 500,000 characters, which is up to about 2 MB of UTF-8 in JSON.
const BODY_LIMIT_BYTES = 4 * 1024 * 1024;
const HEALTH_PATH = '/health';

export function createCodeToolsServer(internalToken: string, config: CodeToolsConfig) {
    const server = Fastify({
        loggerInstance: logger,
        bodyLimit: BODY_LIMIT_BYTES,
    });

    // Lazy, memory-only lifecycle shared by every domain command.
    let manager: OperationManager | undefined;
    const operations = () => {
        manager ??= new OperationManager('code');

        return manager;
    };

    server.addHook('onClose', async () => {
        await manager?.close();
    });

    // Every route except the Kubernetes liveness probe needs the token that only
    // cluster-helper has, because the tools give a full shell in the container.
    server.addHook('onRequest', (request, reply, done) => {
        if (request.url === HEALTH_PATH || isValidBearerAuthorizationHeader(request.headers.authorization, internalToken)) {
            done();

            return;
        }

        logger.warn({
            method: request.method,
            url: request.url,
        }, '⚠️ Rejected a request without a valid internal token');
        void reply.code(401).send({
            status: 'error',
            code: 'unauthorized',
            message: 'Unauthorized',
        });
    });

    server.get(HEALTH_PATH, () => {
        return { status: 'ok' };
    });

    server.post<{ Params: { tool: string }; Body: unknown }>('/code/:tool', async (request, reply) => {
        const { tool: name } = request.params;
        const { statusCode, body } = await runToolCall({
            name,
            logger,
            run: () => {
                if (isOperationToolName(name)) {
                    return operations().control(name, readOperationArguments(name, request.body));
                }

                if (!isCodeToolName(name)) {
                    throw new ToolError('unknown_tool', `Unknown code tool "${name}"`);
                }

                if (isManagedCodeToolName(name)) {
                    const args = readCodeToolArguments(request.body, name);

                    return operations().launch({
                        tool: name,
                        args,
                        run: () => CODE_TOOLS[name](config, args),
                    });
                }

                return CODE_TOOLS[name](config, request.body);
            },
        });

        return reply.code(statusCode).send(body);
    });

    return server;
}

export type CodeToolsServer = ReturnType<typeof createCodeToolsServer>;
