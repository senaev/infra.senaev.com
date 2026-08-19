import { logger } from "../logger";
import { TRACKING_HASH_KEY } from "./readNoteTracking";
import { updateNoteFrontmatter } from "./updateNoteFrontmatter";

/**
 * Records the fingerprint of what was just pushed, adding the key when the note has none yet.
 *
 * Because updateNoteFrontmatter re-reads the file, an edit that landed while Telegram was
 * being called is preserved rather than overwritten. That same edit makes the hash written
 * here already stale, which is correct: the next push recomputes it, sees the difference, and
 * sends the newer content.
 */
export async function writeContentHashToFrontmatter(
    relativePath: string,
    hash: string,
): Promise<void> {
    await updateNoteFrontmatter(relativePath, ({ lines, closingIndex }) => {
        // Matching includes the colon so this stays distinct from `telegram-post-clone:`,
        // which is a strict prefix of this key.
        const keyIndex = lines.findIndex(
            (line, index) =>
                index > 0 &&
                index < closingIndex &&
                line.trim().startsWith(`${TRACKING_HASH_KEY}:`),
        );

        const updated = [...lines];
        const keyLine = `${TRACKING_HASH_KEY}: ${hash}`;

        if (keyIndex === -1) {
            // Appended as the block's last line on purpose: inserting anywhere else risks
            // landing between a key and the list items that belong to it.
            updated.splice(closingIndex, 0, keyLine);
        } else {
            updated[keyIndex] = keyLine;
        }

        return updated;
    });

    logger.info({ relativePath, hash }, "🔖 Recorded content hash in note");
}
