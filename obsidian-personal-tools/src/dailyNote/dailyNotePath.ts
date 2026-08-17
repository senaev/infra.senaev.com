import { TAbstractFile, TFile } from 'obsidian';

/** Vault-root folder that periodic daily notes live in. */
export const DAILY_NOTE_FOLDER = 'periodic/day/';

/** Extension every note path ends with; also keeps date-named folders out. */
const MARKDOWN_EXTENSION = '.md';

/** Matches daily note basenames such as `2026-08-01`. */
const DAILY_NOTE_BASENAME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is a bare `YYYY-MM-DD` daily note date, e.g. `2026-08-01`. */
export function isDailyNoteDateString(value: string): boolean {
	return DAILY_NOTE_BASENAME_PATTERN.test(value);
}

/** Formats `date` as `YYYY-MM-DD`, using local (not UTC) date parts. */
export function formatDailyNoteBasename(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Returns the vault path of the daily note for `date`, e.g. `periodic/day/2026-08-01.md`. */
export function getDailyNotePath(date: Date): string {
	return `${DAILY_NOTE_FOLDER}${formatDailyNoteBasename(date)}.md`;
}

/**
 * Returns the `YYYY-MM-DD` date of a daily note path, or `null` when `path` is
 * not one. Works on a raw path so it can also be used for the old path of a
 * rename event, where no file object exists any more.
 *
 * `YYYY-MM-DD` strings sort chronologically as plain strings, so callers can
 * compare the results directly.
 */
export function getDailyNoteDateFromPath(path: string): string | null {
	if (!path.startsWith(DAILY_NOTE_FOLDER) || !path.endsWith(MARKDOWN_EXTENSION)) {
		return null;
	}

	const basename = path.slice(
		DAILY_NOTE_FOLDER.length,
		path.length - MARKDOWN_EXTENSION.length,
	);

	return DAILY_NOTE_BASENAME_PATTERN.test(basename) ? basename : null;
}

/** Whether `file` is a daily note, i.e. `periodic/day/YYYY-MM-DD.md`. */
export function isDailyNoteFile(file: TAbstractFile): boolean {
	return getDailyNoteDateFromPath(file.path) !== null;
}

/**
 * Returns the calendar date represented by `file`, or `null` if `file` is
 * not a periodic daily note (i.e. it doesn't live in `periodic/day/` or its
 * name isn't a `YYYY-MM-DD` date).
 */
export function getDailyNoteDate(file: TFile | null): Date | null {
	if (!file) {
		return null;
	}

	if (!file.path.startsWith(DAILY_NOTE_FOLDER)) {
		return null;
	}

	const match = DAILY_NOTE_BASENAME_PATTERN.exec(file.basename);
	if (!match) {
		return null;
	}

	const [, year, month, day] = match;
	const date = new Date(Number(year), Number(month) - 1, Number(day));

	// Avoid the date shifting to the previous/next day due to DST edge cases.
	date.setHours(12, 0, 0, 0);

	return date;
}
