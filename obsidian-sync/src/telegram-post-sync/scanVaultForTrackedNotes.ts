import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { IGNORED_DIRECTORIES } from "./ignoredPaths";
import { readNoteTracking } from "./readNoteTracking";
import { setTrackedNote, type TrackedNote } from "./trackedNotes";

async function collectMarkdownFiles(directory: string, found: string[]): Promise<void> {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        logger.warn({ err: error, directory }, "⚠️ Could not read directory during scan");
        return;
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(entry.name)) {
                continue;
            }
            await collectMarkdownFiles(join(directory, entry.name), found);
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".md")) {
            found.push(join(directory, entry.name));
        }
    }
}

/** Walks the vault once at startup and registers every note carrying the tracking key. */
export async function scanVaultForTrackedNotes(): Promise<TrackedNote[]> {
    logger.info({ vault: OBSIDIAN_VAULT_PATH }, "🔍 Scanning vault for tracked notes");

    const markdownFiles: string[] = [];
    await collectMarkdownFiles(OBSIDIAN_VAULT_PATH, markdownFiles);

    const tracked: TrackedNote[] = [];
    for (const absolutePath of markdownFiles) {
        const relativePath = relative(OBSIDIAN_VAULT_PATH, absolutePath);
        const result = await readNoteTracking(relativePath);
        if (result === null) {
            continue;
        }

        setTrackedNote(result.tracked);
        tracked.push(result.tracked);
        logger.info(
            { relativePath, chatId: result.tracked.chatId, messageId: result.tracked.messageId },
            "📌 Tracking note",
        );
    }

    logger.info(
        { scanned: markdownFiles.length, tracked: tracked.length },
        "✅ Vault scan complete",
    );

    return tracked;
}
