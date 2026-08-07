import { logger } from "../logger";

/** Parses `short_links.md` contents into an id -> url map. */
export function parseShortLinksContent(content: string): Map<string, string> {
    const map = new Map<string, string>();

    for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const spaceIndex = line.indexOf(" ");
        if (spaceIndex <= 0) {
            logger.warn({ line }, "⚠️ Skipping malformed short_links line");
            continue;
        }

        const id = line.slice(0, spaceIndex);
        const url = line.slice(spaceIndex + 1).trim();
        if (!id || !url) {
            logger.warn({ line }, "⚠️ Skipping malformed short_links line");
            continue;
        }

        map.set(id, url);
    }

    return map;
}
