import { join } from 'node:path';

import { OBSIDIAN_VAULT_PATH } from './env';

/** Only files under this directory are exposed by the `?note=`/`?file=` routes. */
export const PUBLIC_DIR = join(OBSIDIAN_VAULT_PATH, 'public');

/**
 * Served byte-for-byte under `GET /public-static/*`, keeping the directory
 * layout intact. Unlike PUBLIC_DIR, where only a file's basename matters, the
 * request path here maps directly onto a path inside this directory.
 */
export const PUBLIC_STATIC_DIR = join(OBSIDIAN_VAULT_PATH, 'public-static');

/**
 * Obsidian Tasks file that receives tasks created via `POST /tasks`. Mirrors
 * TASKS_FILE_PATH from the Obsidian plugin's (now removed) tasks-sync feature,
 * which that endpoint replaces.
 */
export const TASKS_FILE_PATH = join(OBSIDIAN_VAULT_PATH, '@senaev', 'tasks', 'tasks_streaming.md');

/** Flat `<id> <url>` mapping file backing the short link routes. */
export const SHORT_LINKS_FILE_PATH = join(OBSIDIAN_VAULT_PATH, 'short_links', 'short_links.md');

/**
 * `note path -> pushed content hash` map that survives a restart, so a new pod does not
 * re-push every tracked note just to be told nothing changed.
 *
 * Deliberately not a markdown file and deliberately not next to any note: it is machine
 * state, and putting it under the personal tools folder keeps it out of search results,
 * out of the graph, and out of the vault walk, which only looks at `.md`.
 */
export const TELEGRAM_SYNC_HASHES_FILE_PATH = join(
    OBSIDIAN_VAULT_PATH,
    'plugins',
    'senaev-personal-tools',
    'telegram-sync-hashes.json'
);
