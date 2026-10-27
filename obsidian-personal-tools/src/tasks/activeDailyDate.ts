import { isActiveDailyDate } from 'senaev-utils/src/obsidianTasks/dailyTasks';
import { formatDailyNoteBasename } from '../dailyNote/dailyNotePath';

/** A predicate telling whether the daily note for `noteDate` is the active one. */
export type IsActiveDailyDate = (noteDate: string) => boolean;

/**
 * Only today's and future notes are active. Today's date is read on every call,
 * so the answer stays correct across midnight.
 */
export const isActiveDailyDateFromToday: IsActiveDailyDate = (noteDate) =>
	isActiveDailyDate({
		noteDate,
		today: formatDailyNoteBasename(new Date()),
	});
