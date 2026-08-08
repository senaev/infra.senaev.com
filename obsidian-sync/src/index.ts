import { logger } from "./logger";
import { runContinuousSync } from "./obsidian-cli/runContinuousSync";
import { setUpVaultSync } from "./obsidian-cli/setUpVaultSync";
import { runVaultServer } from "./server/runVaultServer";
import { startTelegramPostSyncInBackground } from "./telegram-post-sync/startTelegramPostSync";

async function main(): Promise<never> {
    await setUpVaultSync();
    await runVaultServer();

    // Backgrounded on purpose: the initial push talks to Telegram, and a failure there
    // must not stop the vault server or the sync loop below from running.
    startTelegramPostSyncInBackground();

    // Never resolves while sync is healthy, so this keeps the process alive and
    // turns a dead sync into a crash that Kubernetes restarts.
    return runContinuousSync();
}

process.on("SIGTERM", () => {
    process.exit(0);
});

process.on("SIGINT", () => {
    process.exit(0);
});

main().catch((error) => {
    logger.error(error, "❌ obsidian-sync exited");
    process.exit(1);
});
