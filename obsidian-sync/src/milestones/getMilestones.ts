import { readFile } from 'node:fs/promises';

import { logger } from '../logger';
import { MILESTONES_CONFIG_FILE_PATH } from '../vaultPaths';

import type { CalendarDay } from './calendarDay';
import { collectMilestones } from './collectMilestones';
import { parseMilestonesConfig } from './milestonesConfig';
import { readVaultNotes } from './readVaultNotes';

/** The milestones of `today` and of the day after it, read from the vault. */
export async function getMilestones(today: CalendarDay): Promise<ReturnType<typeof collectMilestones>> {
    const config = parseMilestonesConfig(JSON.parse(await readFile(MILESTONES_CONFIG_FILE_PATH, 'utf8')));
    const notes = await readVaultNotes();

    return collectMilestones(notes, config, today, (note, rule, error) => {
        logger.warn({
            err: error,
            path: note.path,
            rule,
        }, '⚠️ Invalid milestone rule');
    });
}
