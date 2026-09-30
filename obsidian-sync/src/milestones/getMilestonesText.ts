import { readFile } from 'node:fs/promises';

import { logger } from '../logger';
import { MILESTONES_CONFIG_FILE_PATH } from '../vaultPaths';

import type { CalendarDay } from './calendarDay';
import { collectMilestoneLines } from './collectMilestones';
import { parseMilestonesConfig } from './milestonesConfig';
import { readVaultNotes } from './readVaultNotes';

/**
 * One line per milestone of `today` and the day after it, in the plugin's text format.
 * Empty when there are none.
 */
export async function getMilestonesText(today: CalendarDay): Promise<string> {
    const config = parseMilestonesConfig(JSON.parse(await readFile(MILESTONES_CONFIG_FILE_PATH, 'utf8')));
    const notes = await readVaultNotes();

    const lines = collectMilestoneLines(notes, config, today, (note, rule, error) => {
        logger.warn({
            err: error,
            path: note.path,
            rule,
        }, '⚠️ Invalid milestone rule');
    });

    return lines.join('\n');
}
