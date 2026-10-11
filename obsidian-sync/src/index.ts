import { installGracefulShutdown } from 'senaev-utils/src/utils/process/installGracefulShutdown';

import { logger } from './logger';
import { runContinuousSync } from './obsidian-cli/runContinuousSync';
import { setUpVaultSync } from './obsidian-cli/setUpVaultSync';
import { runVaultServer } from './server/runVaultServer';
import { startTelegramPostSyncInBackground } from './telegram-post-sync/startTelegramPostSync';

let server: Awaited<ReturnType<typeof runVaultServer>> | undefined;
let background: ReturnType<typeof startTelegramPostSyncInBackground> | undefined;
let continuous: Promise<void> | undefined;
let starting: Promise<void> | undefined;

const lifecycle = installGracefulShutdown({
    stop: async () => {
        await starting?.catch(() => undefined);
        const outcomes = await Promise.allSettled([
            server?.close(),
            background?.close(),
            continuous,
        ]);
        const failed = outcomes.find((outcome) => outcome.status === 'rejected');

        if (failed?.status === 'rejected') {
            throw failed.reason;
        }
    },
    reportError: (error) => logger.error(error, '❌ Obsidian shutdown failed'),
});

async function start(): Promise<void> {
    await setUpVaultSync(lifecycle.signal);
    lifecycle.signal.throwIfAborted();
    server = await runVaultServer();
    lifecycle.signal.throwIfAborted();
    background = startTelegramPostSyncInBackground(lifecycle.signal);
}

async function main(): Promise<void> {
    starting = start();
    await starting;
    lifecycle.signal.throwIfAborted();
    continuous = runContinuousSync(lifecycle.signal);
    await continuous;
}

main().catch(async (error) => {
    if (!lifecycle.signal.aborted) {
        logger.error(error, '❌ obsidian-sync exited');
        await lifecycle.shutdown(1);
    }
});
