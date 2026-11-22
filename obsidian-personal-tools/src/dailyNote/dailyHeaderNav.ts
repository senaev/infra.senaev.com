import { App, TFile } from 'obsidian';
import { getDailyNotePath } from './dailyNotePath';

/** Yesterday's daily note, if it exists. */
export interface YesterdayNav {
	path: string;
	/** Whether yesterday's note has at least one unchecked task. */
	hasUndoneTask: boolean;
}

/** Tomorrow's daily note (may not exist yet). */
export interface TomorrowNav {
	path: string;
	exists: boolean;
}

export interface DailyHeaderNav {
	yesterday: YesterdayNav | null;
	/** Weekday name (e.g. `Saturday`) of the note being viewed. */
	weekdayName: string;
	/** Path of the daily note for the real "today", used as a quick jump-home link. */
	todayPath: string;
	tomorrow: TomorrowNav;
}

/** Whether `file` contains at least one unchecked (`- [ ]`) list item. */
function hasUndoneTask(app: App, file: TFile): boolean {
	const listItems = app.metadataCache.getFileCache(file)?.listItems ?? [];
	return listItems.some((item) => item.task === ' ');
}

/**
 * Computes the previous/current/next-day navigation info shown at the top
 * and bottom of a daily note, mirroring the old `dailyHeader.js` Dataview
 * script but using only native Obsidian APIs (no Tasks-plugin dependency).
 */
export function getDailyHeaderNav(app: App, noteDate: Date): DailyHeaderNav {
	const yesterdayDate = new Date(noteDate);
	yesterdayDate.setDate(yesterdayDate.getDate() - 1);
	const yesterdayPath = getDailyNotePath(yesterdayDate);
	const yesterdayFile = app.vault.getAbstractFileByPath(yesterdayPath);

	const yesterday: YesterdayNav | null =
		yesterdayFile instanceof TFile
			? { path: yesterdayPath, hasUndoneTask: hasUndoneTask(app, yesterdayFile) }
			: null;

	const tomorrowDate = new Date(noteDate);
	tomorrowDate.setDate(tomorrowDate.getDate() + 1);
	const tomorrowPath = getDailyNotePath(tomorrowDate);
	const tomorrowExists = app.vault.getAbstractFileByPath(tomorrowPath) instanceof TFile;

	return {
		yesterday,
		weekdayName: noteDate.toLocaleString('en-US', { weekday: 'long' }),
		todayPath: getDailyNotePath(new Date()),
		tomorrow: { path: tomorrowPath, exists: tomorrowExists },
	};
}
