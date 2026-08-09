import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { parseTelegramPostLink } from "./parseTelegramPostLink";
import { TRACKING_KEY } from "./readNoteTracking";
import { unquoteFrontmatterItem } from "./unquoteFrontmatterItem";

/**
 * Swaps one `telegram-post-clone` entry from a channel-only link to the full link of the
 * post we just published, leaving every other entry and the rest of the note untouched.
 *
 * This is the only place obsidian-sync writes to a note the user authored, so it is
 * deliberately narrow: the file is re-read immediately beforehand, exactly one item is
 * rewritten, and the result is swapped in via an atomic rename so a crash can't leave a
 * half-written note.
 *
 * Throws rather than writing anything it can't justify — the caller relies on that to avoid
 * ever publishing a second post for the same entry.
 */
export async function replaceTrackingLinkInFrontmatter(
    relativePath: string,
    originalLink: string,
    postLink: string,
): Promise<void> {
    // Checked before touching the file: writing an unusable value would make the note look
    // untracked, and the next edit would publish yet another post.
    if (parseTelegramPostLink(postLink)?.kind !== "post") {
        throw new Error(`Refusing to write an unusable ${TRACKING_KEY} link: ${postLink}`);
    }

    const absolutePath = join(OBSIDIAN_VAULT_PATH, relativePath);
    const lines = (await readFile(absolutePath, "utf8")).split("\n");

    if (lines[0]?.trim() !== "---") {
        throw new Error(`Note "${relativePath}" has no frontmatter to update`);
    }

    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (closingIndex === -1) {
        throw new Error(`Note "${relativePath}" has an unterminated frontmatter block`);
    }

    const keyIndex = lines.findIndex(
        (line, index) =>
            index > 0 && index < closingIndex && line.trim().startsWith(`${TRACKING_KEY}:`),
    );
    const keyLine = keyIndex === -1 ? undefined : lines[keyIndex];
    if (keyLine === undefined) {
        throw new Error(`Note "${relativePath}" no longer has a ${TRACKING_KEY} key`);
    }

    const replacedLines = replaceItem({
        lines,
        keyIndex,
        keyLine,
        closingIndex,
        originalLink,
        postLink,
    });
    if (replacedLines === null) {
        throw new Error(
            `Note "${relativePath}" no longer lists ${originalLink} under ${TRACKING_KEY}`,
        );
    }

    // Dot-prefixed and not a .md file, so neither Obsidian nor our own watcher picks it up
    // during the brief moment it exists.
    const temporaryPath = join(dirname(absolutePath), `.${basename(absolutePath)}.tg-sync.tmp`);
    await writeFile(temporaryPath, replacedLines.join("\n"), "utf8");
    await rename(temporaryPath, absolutePath);

    logger.info({ relativePath, originalLink, postLink }, "✍️ Wrote post link back to note");
}

type ReplaceInput = {
    lines: string[];
    keyIndex: number;
    keyLine: string;
    closingIndex: number;
    originalLink: string;
    postLink: string;
};

/**
 * Rewrites the first item matching `originalLink`, in whichever of the three YAML shapes the
 * key uses. Returns null when no item matches, which the caller treats as an error.
 *
 * Only the first match is replaced: if the same channel is listed twice, each published post
 * consumes one entry, and the next run fills in the other.
 */
function replaceItem({
    lines,
    keyIndex,
    keyLine,
    closingIndex,
    originalLink,
    postLink,
}: ReplaceInput): string[] | null {
    const updated = [...lines];
    const indent = keyLine.slice(0, keyLine.length - keyLine.trimStart().length);
    const inlineValue = keyLine.trim().slice(TRACKING_KEY.length + 1).trim();

    // telegram-post-clone: [link, link]
    if (inlineValue.startsWith("[")) {
        const items = inlineValue.replace(/^\[|\]$/g, "").split(",");
        const itemIndex = items.findIndex(
            (item) => unquoteFrontmatterItem(item) === originalLink,
        );
        if (itemIndex === -1) {
            return null;
        }

        items[itemIndex] = postLink;
        updated[keyIndex] = `${indent}${TRACKING_KEY}: [${items.map((item) => item.trim()).join(", ")}]`;
        return updated;
    }

    // telegram-post-clone: link
    if (inlineValue !== "") {
        if (unquoteFrontmatterItem(inlineValue) !== originalLink) {
            return null;
        }

        updated[keyIndex] = `${indent}${TRACKING_KEY}: ${postLink}`;
        return updated;
    }

    // telegram-post-clone:
    //   - link
    //   - link
    for (let index = keyIndex + 1; index < closingIndex; index += 1) {
        const line = updated[index];
        if (line === undefined) {
            break;
        }

        const trimmed = line.trim();
        if (!trimmed.startsWith("- ") && trimmed !== "-") {
            // Any other content ends the block — either the next key or a blank line.
            break;
        }

        if (unquoteFrontmatterItem(trimmed.slice(1)) !== originalLink) {
            continue;
        }

        const itemIndent = line.slice(0, line.length - line.trimStart().length);
        updated[index] = `${itemIndent}- ${postLink}`;
        return updated;
    }

    return null;
}
