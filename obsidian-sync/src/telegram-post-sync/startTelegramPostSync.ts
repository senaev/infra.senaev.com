import { logger } from "../logger";
import { reportSyncError } from "../telegram/reportSyncError";
import { reconcileTrackedNotes } from "./reconcileTrackedNotes";
import { scanVaultForTrackedNotes } from "./scanVaultForTrackedNotes";
import { syncNoteToTelegramPost } from "./syncNoteToTelegramPost";
import { watchVaultForNoteChanges } from "./watchVaultForNoteChanges";

/**
 * How often to re-read the vault looking for changes the watcher failed to report.
 *
 * This is the only thing that keeps a note syncing once this service has written to it: that
 * write replaces the file through a rename, which detaches the watch from the path permanently,
 * so every later edit of that note arrives silently. The interval is therefore the worst-case
 * delay for any note carrying a post link, which is all of them.
 */
const RECONCILE_INTERVAL_MS = 15_000;

/**
 * Runs reconcileTrackedNotes forever, one pass at a time.
 *
 * Passes never overlap: a vault large enough to take longer than the interval would otherwise
 * stack passes on top of each other, each one pushing the same notes.
 */
function startReconcileLoop(): void {
    let running = false;

    setInterval(() => {
        if (running) {
            logger.info("⏭ Previous reconcile still running, skipping this round");
            return;
        }

        running = true;
        reconcileTrackedNotes()
            .catch((error) => reportSyncError("Reconcile pass failed", error))
            .finally(() => {
                running = false;
            });
    }, RECONCILE_INTERVAL_MS);
}

/**
 * Mirrors notes carrying a `telegram-post-clone` frontmatter key into the channel posts
 * they point at.
 *
 * The watcher starts before the initial push so changes made during startup aren't missed;
 * any overlap collapses inside syncNoteToTelegramPost. The initial push is sequential to
 * stay clear of Telegram's rate limits, and is a no-op for every note whose post already
 * matches, since Telegram answers identical content with "message is not modified".
 *
 * The reconcile loop starts last, once every note has a recorded mtime, so its first pass
 * has something to compare against instead of pushing the whole vault a second time.
 */
export async function startTelegramPostSync(): Promise<void> {
    logger.info("🚀 Starting Telegram post sync");

    watchVaultForNoteChanges((relativePath) => {
        void syncNoteToTelegramPost(relativePath);
    });

    const tracked = await scanVaultForTrackedNotes();

    for (const note of tracked) {
        await syncNoteToTelegramPost(note.relativePath);
    }

    startReconcileLoop();

    logger.info(
        { tracked: tracked.length, reconcileIntervalMs: RECONCILE_INTERVAL_MS },
        "✅ Telegram post sync ready",
    );
}

/** Fire-and-forget wrapper so a sync failure can never prevent the container starting. */
export function startTelegramPostSyncInBackground(): void {
    startTelegramPostSync().catch((error) => {
        void reportSyncError("Telegram post sync failed to start", error);
    });
}
