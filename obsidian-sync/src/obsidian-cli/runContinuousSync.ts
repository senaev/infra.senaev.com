import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { runObsidianCommand } from "./runObsidianCommand";

/**
 * Starts `ob sync --continuous`, which is expected to run for the lifetime of the
 * container. The returned promise therefore only settles when sync stops, which
 * is always a fatal condition — the caller exits so Kubernetes restarts the pod.
 */
export async function runContinuousSync(): Promise<never> {
    logger.info("🔄 Starting continuous sync");

    await runObsidianCommand(["sync", "--path", OBSIDIAN_VAULT_PATH, "--continuous"]);

    throw new Error("ob sync --continuous exited on its own");
}
