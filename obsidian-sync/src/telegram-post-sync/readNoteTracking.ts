import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { parseTelegramPostLink } from "./parseTelegramPostLink";
import { readFrontmatterList } from "./readFrontmatterList";
import { stripFrontmatter } from "./render/stripFrontmatter";
import type { TrackedNote, TrackedTarget } from "./trackedNotes";

/** Frontmatter key that opts a note into being mirrored to one or more Telegram posts. */
export const TRACKING_KEY = "telegram-post-clone";

export type NoteTracking = {
    tracked: TrackedNote;
    content: string;
};

/**
 * Reads a note and decides whether it is tracked.
 *
 * The key accepts a single link or a list of them, in any of the YAML shapes Obsidian
 * writes. Unusable entries are warned about and skipped rather than failing the whole note,
 * so one typo can't stop the other mirrors from updating.
 *
 * Returns null when the file is gone, carries no `telegram-post-clone` key, or has no usable
 * link left — all of which mean "not tracked" rather than "error".
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
    warnAboutRepeatedKey(relativePath, frontmatter);

    const links = readFrontmatterList(frontmatter, TRACKING_KEY);
    if (links.length === 0) {
        return null;
    }

    const targets: TrackedTarget[] = [];
    for (const link of links) {
        const target = parseTelegramPostLink(link);
        if (target === null) {
            logger.warn(
                { relativePath, link },
                `⚠️ Unsupported ${TRACKING_KEY} link — expected https://t.me/c/<channel>[/<message>]`,
            );
            continue;
        }

        targets.push({ link, target });
    }

    if (targets.length === 0) {
        logger.warn(
            { relativePath },
            `⚠️ Note has a ${TRACKING_KEY} key but no usable link, so it will not be synced`,
        );
        return null;
    }

    return {
        tracked: { relativePath, targets, mtimeMs },
        content,
    };
}

/**
 * YAML keeps only the last of repeated keys, and our reader keeps only the first — either
 * way links go missing silently, which is exactly the failure this warning exists to avoid.
 */
function warnAboutRepeatedKey(relativePath: string, frontmatter: string): void {
    const occurrences = frontmatter
        .split("\n")
        .filter((line) => line.trim().startsWith(`${TRACKING_KEY}:`)).length;

    if (occurrences > 1) {
        logger.warn(
            { relativePath, occurrences },
            `⚠️ ${TRACKING_KEY} appears more than once — only the first is used, ` +
                `list the links under a single key instead`,
        );
    }
}
