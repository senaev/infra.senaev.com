import { logger } from '../logger';

import { loadPushedNoteHashes } from './pushedNoteHashes';
import { reconcileTrackedNotes } from './reconcileTrackedNotes';
import { reportSyncError } from './reportSyncError';
import { scanVaultForTrackedNotes } from './scanVaultForTrackedNotes';
import { syncNoteToTelegramPost } from './syncNoteToTelegramPost';
import { watchVaultForNoteChanges } from './watchVaultForNoteChanges';

/**
 * How often to re-read the vault looking for changes the watcher failed to report.
 *
 * This is the only thing that keeps a note syncing once this service has written to it: that
 * write replaces the file through a rename, which detaches the watch from the path permanently,
 * so every later edit of that note arrives silently. The interval is therefore the worst-case
 * delay for any note carrying a post link, which is all of them.
 */
const RECONCILE_INTERVAL_MS = 15_000;

/**
 * Runs reconcileTrackedNotes forever, one pass at a time.
 *
 * Passes never overlap: a vault large enough to take longer than the interval would otherwise
 * stack passes on top of each other, each one pushing the same notes.
 */
function startReconcileLoop(signal: AbortSignal, track: (work: Promise<void>) => void): () => void {
    let running = false;

    const timer = setInterval(() => {
        if (signal.aborted) {
            return;
        }

        if (running) {
            logger.info('⏭ Previous reconcile still running, skipping this round');

            return;
        }

        running = true;
        track(reconcileTrackedNotes(signal)
            .catch((error) => reportSyncError('Reconcile pass failed', error))
            .finally(() => {
                running = false;
            }));
    }, RECONCILE_INTERVAL_MS);

    return () => clearInterval(timer);
}

/**
 * Mirrors notes carrying a `telegram-post-clone` frontmatter key into the channel posts
 * they point at.
 *
 * Pushed hashes are loaded first, so a restart only pushes notes that changed while this
 * service was down instead of the whole vault.
 *
 * The watcher starts before the initial push so changes made during startup aren't missed;
 * any overlap collapses inside syncNoteToTelegramPost. The initial push is sequential to
 * stay clear of Telegram's rate limits, and is a no-op for every note whose post already
 * matches, since Telegram answers identical content with "message is not modified".
 *
 * The reconcile loop starts last, once every note has a recorded mtime, so its first pass
 * has something to compare against instead of pushing the whole vault a second time.
 */
async function startTelegramPostSync(options: {
    signal: AbortSignal;
    track: (work: Promise<void>) => void;
    own: (stop: () => void) => void;
}): Promise<void> {
    const {
        signal, track, own,
    } = options;

    if (signal.aborted) {
        return;
    }

    logger.info('🚀 Starting Telegram post sync');

    loadPushedNoteHashes();

    own(watchVaultForNoteChanges((relativePath) => {
        if (!signal.aborted) {
            track(syncNoteToTelegramPost(relativePath));
        }
    }));

    const tracked = await scanVaultForTrackedNotes();

    for (const note of tracked) {
        if (signal.aborted) {
            return;
        }

        await syncNoteToTelegramPost(note.relativePath);
    }

    if (signal.aborted) {
        return;
    }

    own(startReconcileLoop(signal, track));

    logger.info(
        {
            tracked: tracked.length,
            reconcileIntervalMs: RECONCILE_INTERVAL_MS,
        },
        '✅ Telegram post sync ready'
    );
}

/** Fire-and-forget wrapper so a sync failure can never prevent the container starting. */
export function startTelegramPostSyncInBackground(parentSignal: AbortSignal): { close: () => Promise<void> } {
    const controller = new AbortController();
    const { signal } = controller;
    const abort = () => controller.abort(parentSignal.reason);

    if (parentSignal.aborted) {
        abort();
    } else {
        parentSignal.addEventListener('abort', abort, { once: true });
    }

    const pending = new Set<Promise<void>>();
    const resources = new Set<() => void>();
    const stopScheduling = () => {
        for (const stop of resources) {
            stop();
        }

        resources.clear();
    };
    const track = (work: Promise<void>) => {
        pending.add(work);
        void work.then(() => pending.delete(work), () => pending.delete(work));
    };
    const own = (stop: () => void) => {
        if (signal.aborted) {
            stop();
        } else {
            resources.add(stop);
        }
    };

    signal.addEventListener('abort', stopScheduling, { once: true });
    track(startTelegramPostSync({
        signal,
        track,
        own,
    }).catch(async (error) => {
        if (!signal.aborted) {
            await reportSyncError('Telegram post sync failed to start', error);
        }
    }));

    return {
        close: async () => {
            controller.abort(new Error('Background sync stopping'));
            parentSignal.removeEventListener('abort', abort);
            stopScheduling();
            signal.removeEventListener('abort', stopScheduling);
            await Promise.allSettled(pending);
        },
    };
}
