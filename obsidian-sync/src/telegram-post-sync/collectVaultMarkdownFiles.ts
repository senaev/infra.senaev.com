import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { OBSIDIAN_VAULT_PATH } from "../env";
import { logger } from "../logger";
import { IGNORED_DIRECTORIES } from "./ignoredPaths";

async function walk(directory: string, found: string[]): Promise<void> {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        // A directory that vanished mid-walk is normal while sync is running, and one we
        // cannot read is not worth failing the whole pass over.
        logger.warn({ err: error, directory }, "⚠️ Could not read directory during walk");
        return;
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(entry.name)) {
                continue;
            }
            await walk(join(directory, entry.name), found);
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".md")) {
            found.push(relative(OBSIDIAN_VAULT_PATH, join(directory, entry.name)));
        }
    }
}

/** Every markdown file in the vault, as paths relative to the vault root. */
export async function collectVaultMarkdownFiles(): Promise<string[]> {
    const found: string[] = [];
    await walk(OBSIDIAN_VAULT_PATH, found);
    return found;
}
