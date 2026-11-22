import { installGracefulShutdown } from 'senaev-utils/src/utils/process/installGracefulShutdown';

import { logger } from './logger';
import { runCodeToolsServer } from './server/runCodeToolsServer';
import { createCodeToolsConfig } from './tools/codeToolsConfig';

let server: Awaited<ReturnType<typeof runCodeToolsServer>> | undefined;
let starting: Promise<void> | undefined;

const lifecycle = installGracefulShutdown({
    stop: async () => {
        await starting?.catch(() => undefined);
        await server?.close();
    },
    reportError: (error) => logger.error(error, '❌ Code tools shutdown failed'),
});

async function main(): Promise<void> {
    starting = runCodeToolsServer(createCodeToolsConfig()).then((started) => {
        server = started;
    });
    await starting;
    lifecycle.signal.throwIfAborted();
}

main().catch(async (error) => {
    if (!lifecycle.signal.aborted) {
        logger.error(error, '❌ code-tools exited');
        await lifecycle.shutdown(1);
    }
});
