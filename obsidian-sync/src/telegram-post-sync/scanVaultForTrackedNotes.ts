import { OBSIDIAN_VAULT_PATH } from '../env';
import { logger } from '../logger';

import { collectVaultMarkdownFiles } from './collectVaultMarkdownFiles';
import { readNoteTracking } from './readNoteTracking';
import { setTrackedNote, type TrackedNote } from './trackedNotes';

/** Walks the vault once at startup and registers every note carrying the tracking key. */
export async function scanVaultForTrackedNotes(): Promise<TrackedNote[]> {
    logger.info({ vault: OBSIDIAN_VAULT_PATH }, '🔍 Scanning vault for tracked notes');

    const markdownFiles = await collectVaultMarkdownFiles();

    const tracked: TrackedNote[] = [];

    for (const relativePath of markdownFiles) {
        const result = await readNoteTracking(relativePath);

        if (result === null) {
            continue;
        }

        setTrackedNote(result.tracked);
        tracked.push(result.tracked);
        logger.info(
            {
                relativePath,
                targets: result.tracked.targets.map((entry) => entry.link),
            },
            '📌 Tracking note'
        );
    }

    logger.info(
        {
            scanned: markdownFiles.length,
            tracked: tracked.length,
        },
        '✅ Vault scan complete'
    );

    return tracked;
}
