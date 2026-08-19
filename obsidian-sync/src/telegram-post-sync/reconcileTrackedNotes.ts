import { logger } from "../logger";
import { collectVaultMarkdownFiles } from "./collectVaultMarkdownFiles";
import { readNoteTracking } from "./readNoteTracking";
import { syncNoteToTelegramPost } from "./syncNoteToTelegramPost";
import { deleteTrackedNote, getTrackedNote } from "./trackedNotes";

/**
 * Re-reads the vault and pushes every tracked note whose file changed since its last push.
 *
 * This is the mechanism that actually keeps notes in sync, not a safety net. Replacing a file
 * through a rename detaches the inotify watch from the path permanently, after which in-place
 * writes to it — which is how `ob sync` applies downloaded notes — arrive silently. Since this
 * service writes a post link and a content hash into every note it mirrors, every one of them
 * ends up in that state, and the watcher only ever reports the first change to each.
 *
 * The watcher therefore provides latency for notes not yet written to, and this provides the
 * guarantee for the rest. Notes whose mtime has not moved are skipped, so a quiet vault costs
 * one readdir and one stat per note.
 *
 * Note that a note whose push failed is not retried here: the failed push still records the
 * new mtime, so reconcile treats it as done. That is deliberate — publishing is guarded
 * against repeats, and retrying a permanently broken note every minute would turn one
 * failure into an endless stream of error messages. Editing the note retries it.
 */
export async function reconcileTrackedNotes(): Promise<void> {
    const markdownFiles = await collectVaultMarkdownFiles();

    let resynced = 0;
    for (const relativePath of markdownFiles) {
        // Read the previous mtime before readNoteTracking, since the push below overwrites it.
        const previous = getTrackedNote(relativePath);
        const result = await readNoteTracking(relativePath);

        if (result === null) {
            if (deleteTrackedNote(relativePath)) {
                logger.info(
                    { relativePath },
                    "🚫 Note is no longer tracked, leaving the post as is",
                );
            }
            continue;
        }

        if (previous !== undefined && previous.mtimeMs === result.tracked.mtimeMs) {
            continue;
        }

        logger.info(
            { relativePath, known: previous !== undefined },
            "🔁 Reconcile found a note the watcher did not report",
        );
        await syncNoteToTelegramPost(relativePath);
        resynced += 1;
    }

    if (resynced > 0) {
        logger.info({ resynced }, "✅ Reconcile pushed notes the watcher missed");
    }
}
