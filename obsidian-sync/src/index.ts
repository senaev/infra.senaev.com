import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { logger } from './logger';
import { runContinuousSync } from './obsidian-cli/runContinuousSync';
import { setUpVaultSync } from './obsidian-cli/setUpVaultSync';
import { runVaultServer } from './server/runVaultServer';
import { startTelegramPostSyncInBackground } from './telegram-post-sync/startTelegramPostSync';

let server: Awaited<ReturnType<typeof runVaultServer>> | undefined;
let background: ReturnType<typeof startTelegramPostSyncInBackground> | undefined;
let continuous: Promise<void> | undefined;
let starting: Promise<void> | undefined;
let closing: Promise<void> | undefined;

const cancellation = new AbortController();
const { signal } = cancellation;
const reportShutdownError = (error: unknown) => logger.error(error, '❌ Obsidian shutdown failed');
const subscribeShutdown = createShutdownController(process, reportShutdownError);

async function stop(): Promise<void> {
    cancellation.abort(new Error('Service stopping'));
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
}

subscribeShutdown(() => {
    closing ??= stop();

    return closing;
});

async function start(): Promise<void> {
    await setUpVaultSync(signal);
    signal.throwIfAborted();
    server = await runVaultServer();
    signal.throwIfAborted();
    background = startTelegramPostSyncInBackground(signal);
}

async function main(): Promise<void> {
    starting = start();
    await starting;
    signal.throwIfAborted();
    continuous = runContinuousSync(signal);
    await continuous;
}

main().catch(async (error) => {
    if (!closing) {
        logger.error(error, '❌ obsidian-sync exited');
        closing = stop().catch(reportShutdownError).finally(() => {
            process.exit(1);
        });
        await closing;
    }
});
