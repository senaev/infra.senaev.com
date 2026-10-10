import { INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS } from './env';
import { logger } from './logger';
import { createCodeToolsServer } from './server/createCodeToolsServer';

const HOST = '0.0.0.0';
const PORT = 8080;

async function main(): Promise<void> {
    const server = createCodeToolsServer(INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS);

    await server.listen({
        port: PORT,
        host: HOST,
    });
    logger.info({ port: PORT }, '✅ Code tools server listening');
}

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});

main().catch((error) => {
    logger.error(error, '❌ code-tools exited');
    process.exit(1);
});
