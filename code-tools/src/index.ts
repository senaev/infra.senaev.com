import { CODE_TOOLS_PROJECTS_PATH, INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS } from './env';
import { logger } from './logger';
import { createCodeToolsServer } from './server/createCodeToolsServer';
import { createCodeToolsConfig } from './tools/codeToolsConfig';

const HOST = '0.0.0.0';
const PORT = 8080;

async function main(): Promise<void> {
    const server = createCodeToolsServer(
        INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS,
        createCodeToolsConfig(CODE_TOOLS_PROJECTS_PATH)
    );

    await server.listen({
        port: PORT,
        host: HOST,
    });
    logger.info({ port: PORT }, '✅ Code tools server listening');
    let closing = false;
    const shutdown = () => {
        if (closing) {
            return;
        }

        closing = true;
        // Bound shutdown even if a legacy direct command or noncooperative handler is hung.
        const timer = setTimeout(() => process.exit(0), 10_000);

        timer.unref();
        void server.close().then(() => process.exit(0), (error: unknown) => {
            logger.error(error, '❌ Code tools shutdown failed');
            process.exit(1);
        });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((error) => {
    logger.error(error, '❌ code-tools exited');
    process.exit(1);
});
