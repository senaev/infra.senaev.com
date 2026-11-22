import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { logger } from './logger';
import { createVaultSync } from './obsidian-cli/createVaultSync';
import { runVaultServer } from './server/runVaultServer';
import { startTelegramPostSyncInBackground } from './telegram-post-sync/startTelegramPostSync';

const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ Obsidian shutdown failed')
);

// Each part is subscribed right after it exists, so on a signal they close in the reverse order:
// the background sync and the server first, then the `ob` commands.
async function main(): Promise<void> {
    const sync = createVaultSync();

    subscribeShutdown(() => sync.close());

    await sync.setUp();

    const server = await runVaultServer();

    subscribeShutdown(() => server.close());

    const background = startTelegramPostSyncInBackground();

    subscribeShutdown(() => background.close());

    await sync.runContinuous();
}

// A failure is an unhandled rejection: Node prints it and exits with 1.
void main();
