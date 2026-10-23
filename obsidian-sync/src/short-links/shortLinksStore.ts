import type { Stats } from 'node:fs';
import {
    mkdir, readFile, stat,
} from 'node:fs/promises';
import { dirname } from 'node:path';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';

import { SHORT_LINKS_FILE_PATH } from '../vaultPaths';

import { generateUniqueShortLinkId } from './generateUniqueShortLinkId';
import {
    appendShortLinkRow, parseShortLinksCsv, type ShortLinksTable,
} from './shortLinksCsv';

type ShortLinksCache = {
    mtimeMs: number;
    size: number;
    content: string;
    table: ShortLinksTable;
};

// In-memory mirror of short_links.csv, refreshed only when the file's mtime/size change.
let cache: ShortLinksCache | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function statIfExists(path: string): Promise<Stats | null> {
    try {
        return await stat(path);
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

/** Ensures the cache reflects the file on disk, reloading only if it changed. `null` if there is no file. */
async function ensureCacheFresh(): Promise<ShortLinksCache | null> {
    const fileStat = await statIfExists(SHORT_LINKS_FILE_PATH);

    if (fileStat === null) {
        cache = null;

        return null;
    }

    if (cache && cache.mtimeMs === fileStat.mtimeMs && cache.size === fileStat.size) {
        return cache;
    }

    const content = await readFile(SHORT_LINKS_FILE_PATH, 'utf8');

    cache = {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
        content,
        table: parseShortLinksCsv(content),
    };

    return cache;
}

/** Runs `task` only after all previously queued short-link writes have settled. */
function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
    const run = writeQueue.then(task, task);

    writeQueue = run.then(
        () => undefined,
        () => undefined
    );

    return run;
}

/** Resolves a short link id to its target url, or `null` if unknown. */
export async function getShortLinkUrl(id: string): Promise<string | null> {
    const freshCache = await ensureCacheFresh();

    return freshCache?.table.links.get(id) ?? null;
}

/**
 * Appends a new short link row and returns its newly assigned id. The path lock is the one
 * of obsidian-csv_query, so an edit of the table at the same time fails instead of losing
 * this row.
 */
export async function createShortLink(targetUrl: string): Promise<string> {
    return await withWriteLock(() => withFileMutation(SHORT_LINKS_FILE_PATH, async () => {
        // Read again: the cache may be older than the file, and the whole file is written back.
        cache = null;
        const current = await ensureCacheFresh();
        const table = current?.table ?? parseShortLinksCsv('');
        const id = generateUniqueShortLinkId(table.links);
        const content = appendShortLinkRow(current?.content ?? '', table.headers, id, targetUrl);

        if (current === null) {
            await mkdir(dirname(SHORT_LINKS_FILE_PATH), { recursive: true });
            await createFileExclusively(SHORT_LINKS_FILE_PATH, content);
        } else {
            await replaceFileAtomically(SHORT_LINKS_FILE_PATH, content);
        }

        cache = null;

        return id;
    }, createCommandExecution()));
}
