import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { parseTelegramPostLink } from "./parseTelegramPostLink";
import { readFrontmatterValue } from "./readFrontmatterValue";
import { stripFrontmatter } from "./render/stripFrontmatter";
import type { TrackedNote } from "./trackedNotes";

/** Frontmatter key that opts a note into being mirrored to a Telegram post. */
export const TRACKING_KEY = "telegram-post-clone";

export type NoteTracking = {
    tracked: TrackedNote;
    content: string;
};

/**
 * Reads a note and decides whether it is tracked.
 *
 * Returns null when the file is gone, carries no `telegram-post-clone` key, or the link
 * is unusable — all of which mean "not tracked" rather than "error", so callers can treat
 * them identically.
 */
export async function readNoteTracking(relativePath: string): Promise<NoteTracking | null> {
    const absolutePath = join(OBSIDIAN_VAULT_PATH, relativePath);

    let content: string;
    let mtimeMs: number;
    try {
        content = await readFile(absolutePath, "utf8");
        mtimeMs = (await stat(absolutePath)).mtimeMs;
    } catch {
        return null;
    }

    const { frontmatter } = stripFrontmatter(content);
    const link = readFrontmatterValue(frontmatter, TRACKING_KEY);
    if (link === null) {
        return null;
    }

    const postRef = parseTelegramPostLink(link);
    if (postRef === null) {
        logger.warn(
            { relativePath, link },
            `⚠️ Unsupported ${TRACKING_KEY} link — only https://t.me/c/<channel>/<message> is supported`,
        );
        return null;
    }

    return { tracked: { ...postRef, relativePath, mtimeMs }, content };
}
