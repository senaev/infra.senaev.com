import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { logger } from './logger';
import { createVaultSync } from './obsidian-cli/createVaultSync';
import { runVaultServer } from './server/runVaultServer';
import { startTelegramPostSyncInBackground } from './telegram-post-sync/startTelegramPostSync';

let stopping = false;
const subscribeShutdown = createShutdownController(
    process,
    (error) => logger.error(error, '❌ Obsidian shutdown failed')
);

// Each part is subscribed right after it exists, so on a signal they close in the reverse order:
// the background sync and the server first, then the `ob` commands.
async function main(): Promise<void> {
    const sync = createVaultSync();

    subscribeShutdown(() => {
        stopping = true;

        return sync.close();
    });

    await sync.setUp();

    if (stopping) {
        return;
    }

    const server = await runVaultServer();

    subscribeShutdown(() => server.close());

    if (stopping) {
        return;
    }

    const background = startTelegramPostSyncInBackground();

    subscribeShutdown(() => background.close());

    await sync.runContinuous();
}

main().catch((error) => {
    if (!stopping) {
        logger.error(error, '❌ obsidian-sync exited');
        process.exit(1);
    }
});
