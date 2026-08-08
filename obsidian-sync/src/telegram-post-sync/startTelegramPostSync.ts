import { logger } from "../logger";
import { reportSyncError } from "../telegram/reportSyncError";
import { scanVaultForTrackedNotes } from "./scanVaultForTrackedNotes";
import { syncNoteToTelegramPost } from "./syncNoteToTelegramPost";
import { watchVaultForNoteChanges } from "./watchVaultForNoteChanges";

/**
 * Mirrors notes carrying a `telegram-post-clone` frontmatter key into the channel posts
 * they point at.
 *
 * The watcher starts before the initial push so changes made during startup aren't missed;
 * any overlap collapses inside syncNoteToTelegramPost. The initial push is sequential to
 * stay clear of Telegram's rate limits, and is a no-op for every note whose post already
 * matches, since Telegram answers identical content with "message is not modified".
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

    logger.info({ tracked: tracked.length }, "✅ Telegram post sync ready");
}

/** Fire-and-forget wrapper so a sync failure can never prevent the container starting. */
export function startTelegramPostSyncInBackground(): void {
    startTelegramPostSync().catch((error) => {
        void reportSyncError("Telegram post sync failed to start", error);
    });
}
