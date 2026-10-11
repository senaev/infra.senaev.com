import { installGracefulShutdown } from 'senaev-utils/src/utils/process/installGracefulShutdown';

import { CODE_TOOLS_PROJECTS_PATH, INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS } from './env';
import { logger } from './logger';
import { createCodeToolsServer } from './server/createCodeToolsServer';
import { createCodeToolsConfig } from './tools/codeToolsConfig';

const HOST = '0.0.0.0';
const PORT = 8080;

let server: ReturnType<typeof createCodeToolsServer> | undefined;

const lifecycle = installGracefulShutdown({
    stop: () => server?.close() ?? Promise.resolve(),
    reportError: (error) => logger.error(error, '❌ Code tools shutdown failed'),
});

async function main(): Promise<void> {
    server = createCodeToolsServer(
        INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS,
        createCodeToolsConfig(CODE_TOOLS_PROJECTS_PATH)
    );
    lifecycle.signal.throwIfAborted();
    await server.listen({
        port: PORT,
        host: HOST,
    });
    logger.info({ port: PORT }, '✅ Code tools server listening');
}

main().catch(async (error) => {
    if (!lifecycle.signal.aborted) {
        logger.error(error, '❌ code-tools exited');
        await lifecycle.shutdown(1);
    }
});
