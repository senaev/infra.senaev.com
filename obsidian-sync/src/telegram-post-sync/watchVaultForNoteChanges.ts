import { watch } from "node:fs";
import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { isIgnoredPath } from "./ignoredPaths";

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

    const watcher = watch(OBSIDIAN_VAULT_PATH, { recursive: true }, (eventType, fileName) => {
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

    watcher.on("error", (error) => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOSPC") {
            logger.error(
                { err: error },
                "❌ inotify watch limit reached — raise fs.inotify.max_user_watches on the node",
            );
            return;
        }

        logger.error({ err: error }, "❌ Vault watcher error");
    });
}
