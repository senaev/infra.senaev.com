import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { SHORT_LINKS_FILE_PATH } from "../vaultPaths";
import { generateUniqueShortLinkId } from "./generateUniqueShortLinkId";
import { parseShortLinksContent } from "./parseShortLinksContent";

type ShortLinksCache = {
    mtimeMs: number | null;
    size: number;
    map: Map<string, string>;
};

// In-memory mirror of short_links.md, refreshed only when the file's mtime/size
// change. Avoids re-parsing on every request and sidesteps needing the file to be
// sorted for lookups (a plain id -> url Map is used instead of a binary search).
let cache: ShortLinksCache | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

function isNotFoundError(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Ensures the cache reflects the file on disk, reloading only if it changed. */
async function ensureCacheFresh(): Promise<ShortLinksCache> {
    let fileStat;
    try {
        fileStat = await stat(SHORT_LINKS_FILE_PATH);
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
        cache = { mtimeMs: null, size: 0, map: new Map() };
        return cache;
    }

    if (cache && cache.mtimeMs === fileStat.mtimeMs && cache.size === fileStat.size) {
        return cache;
    }

    const content = await readFile(SHORT_LINKS_FILE_PATH, "utf8");
    cache = { mtimeMs: fileStat.mtimeMs, size: fileStat.size, map: parseShortLinksContent(content) };
    return cache;
}

/** Runs `task` only after all previously queued short-link writes have settled. */
function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
    const run = writeQueue.then(task, task);
    writeQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

/** Resolves a short link id to its target url, or `null` if unknown. */
export async function getShortLinkUrl(id: string): Promise<string | null> {
    const freshCache = await ensureCacheFresh();
    return freshCache.map.get(id) ?? null;
}

/** Appends a new short link entry and returns its newly assigned id. */
export async function createShortLink(targetUrl: string): Promise<string> {
    return withWriteLock(async () => {
        const freshCache = await ensureCacheFresh();
        const id = generateUniqueShortLinkId(freshCache.map);

        await mkdir(dirname(SHORT_LINKS_FILE_PATH), { recursive: true });
        await appendFile(SHORT_LINKS_FILE_PATH, `${id} ${targetUrl}\n`, "utf8");

        freshCache.map.set(id, targetUrl);
        try {
            const fileStat = await stat(SHORT_LINKS_FILE_PATH);
            freshCache.mtimeMs = fileStat.mtimeMs;
            freshCache.size = fileStat.size;
        } catch {
            // If stat fails for some reason, force a full reload on the next request.
            cache = null;
        }

        return id;
    });
}
