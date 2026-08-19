import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { OBSIDIAN_VAULT_PATH } from "../env";

export type FrontmatterRewrite = (input: {
    lines: string[];
    /** Index of the closing `---`, so a rewrite knows where the frontmatter block ends. */
    closingIndex: number;
}) => string[];

/**
 * Re-reads a note, hands its lines to `rewrite`, and swaps the result back in atomically.
 *
 * Every write to a note the user authored goes through here, so all of them inherit the same
 * guarantees: the file is read immediately before the change instead of reusing a copy from
 * earlier, the frontmatter block is proven to exist first, and the result lands through a
 * rename so a crash cannot leave a half-written note behind.
 *
 * `rewrite` is expected to throw when it cannot justify a change, which aborts the write and
 * leaves the note untouched.
 *
 * Use this sparingly. Writing to a note the user may be editing is inherently unsafe: the
 * read above and the rename below are not one atomic step, so an edit that `ob sync` applies
 * in between is lost, and the version uploaded afterwards can carry that stale body back to
 * every other device. The rename also detaches the inotify watch from this path for good,
 * leaving reconcileTrackedNotes as the only thing that still notices edits to this note.
 *
 * Today the only caller is the post-link write-back, which runs once per note.
 */
export async function updateNoteFrontmatter(
    relativePath: string,
    rewrite: FrontmatterRewrite,
): Promise<void> {
    const absolutePath = join(OBSIDIAN_VAULT_PATH, relativePath);
    const lines = (await readFile(absolutePath, "utf8")).split("\n");

    if (lines[0]?.trim() !== "---") {
        throw new Error(`Note "${relativePath}" has no frontmatter to update`);
    }

    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (closingIndex === -1) {
        throw new Error(`Note "${relativePath}" has an unterminated frontmatter block`);
    }

    const updated = rewrite({ lines, closingIndex });

    // Dot-prefixed and not a .md file, so neither Obsidian nor our own watcher picks it up
    // during the brief moment it exists.
    const temporaryPath = join(dirname(absolutePath), `.${basename(absolutePath)}.tg-sync.tmp`);
    await writeFile(temporaryPath, updated.join("\n"), "utf8");
    await rename(temporaryPath, absolutePath);
}
