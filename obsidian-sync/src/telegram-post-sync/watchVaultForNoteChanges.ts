import { watch, type FSWatcher } from "node:fs";
import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { isIgnoredPath } from "./ignoredPaths";

/** How long to wait before rebuilding a watch that died, so a failing mount can't spin. */
const RESTART_DELAY_MS = 5_000;

// The watcher is a process-wide singleton so it can be rebuilt from elsewhere, which is
// unavoidable: the code that replaces a note file is what breaks the watch, and only it
// knows when that happened. See rearmVaultWatcher.
let watcher: FSWatcher | null = null;
let handler: ((relativePath: string) => void) | null = null;

function startWatching(): void {
    const onNoteChanged = handler;
    if (onNoteChanged === null) {
        return;
    }

    try {
        watcher = watch(OBSIDIAN_VAULT_PATH, { recursive: true }, (eventType, fileName) => {
            if (!fileName) {
                return;
            }

            const relativePath = fileName.toString();
            if (!relativePath.endsWith(".md") || isIgnoredPath(relativePath)) {
                return;
            }

            logger.info({ relativePath, eventType }, "📝 Detected note change");
            onNoteChanged(relativePath);
        });
    } catch (error) {
        logger.error({ err: error }, "❌ Could not start the vault watcher, retrying");
        setTimeout(startWatching, RESTART_DELAY_MS);
        return;
    }

    watcher.on("error", (error) => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOSPC") {
            logger.error(
                { err: error },
                "❌ inotify watch limit reached — raise fs.inotify.max_user_watches on the node",
            );
            return;
        }

        // A dead watcher is silent rather than loud: without rebuilding it, every later edit
        // would be missed and the only thing still syncing notes would be the reconcile pass.
        logger.error({ err: error }, "❌ Vault watcher error, rebuilding the watch");
        watcher?.close();
        watcher = null;
        setTimeout(startWatching, RESTART_DELAY_MS);
    });
}

/**
 * Watches the whole vault for markdown changes.
 *
 * The vault is a hostPath bind mount, i.e. a real local filesystem, so inotify sees writes
 * from `ob sync` in this container, from other pods mounting the same path, and from the
 * host itself.
 *
 * Note that recursive watching costs one inotify watch per directory, against a per-uid
 * `fs.inotify.max_user_watches` budget — hence the explicit ENOSPC handling.
 */
export function watchVaultForNoteChanges(onNoteChanged: (relativePath: string) => void): void {
    logger.info({ vault: OBSIDIAN_VAULT_PATH }, "👀 Watching vault for note changes");

    handler = onNoteChanged;
    startWatching();
}

/**
 * Rebuilds the watch from scratch.
 *
 * Replacing a file by renaming another one over it detaches the watch from that path: the
 * rename itself is reported, and then every in-place write that follows is silent, for good.
 * Since this service replaces notes that way when writing a post link back, it has to rebuild
 * the watch afterwards or lose every later edit of the note it just published.
 *
 * Events occurring during the rebuild are lost, which is why reconcileTrackedNotes exists.
 */
export function rearmVaultWatcher(): void {
    if (handler === null) {
        return;
    }

    logger.info("♻️ Rebuilding the vault watch");
    watcher?.close();
    watcher = null;
    startWatching();
}
