import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { logger } from './logger';
import { runCodeToolsServer } from './server/runCodeToolsServer';
import { createCodeToolsConfig } from './tools/codeToolsConfig';

const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ Code tools shutdown failed')
);

async function main(): Promise<void> {
    const server = await runCodeToolsServer(createCodeToolsConfig());

    subscribeShutdown(() => server.close());
}

// A failed start is an unhandled rejection: Node prints it and exits with 1.
void main();
