import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';
import { waitForShutdownCleanup } from 'senaev-utils/src/utils/process/waitForShutdownCleanup';

import { logger } from './logger';
import { runCodeToolsServer } from './server/runCodeToolsServer';
import { createCodeToolsConfig } from './tools/codeToolsConfig';

let stopping = false;
const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ Code tools shutdown failed')
);

async function main(): Promise<void> {
    const starting = runCodeToolsServer(createCodeToolsConfig());

    subscribeShutdown(() => {
        stopping = true;

        return waitForShutdownCleanup(starting.then((server) => server.close(), () => undefined));
    });

    await starting;
}

main().catch((error) => {
    if (!stopping) {
        logger.error(error, '❌ code-tools exited');
        process.exit(1);
    }
});
