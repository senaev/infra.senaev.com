import { Plugin } from 'obsidian';
import {
	formatDailyNoteBasename,
	getDailyNoteDateFromPath,
	isDailyNoteDateString,
	isDailyNoteFile,
} from '../dailyNote/dailyNotePath';

/** A predicate telling whether the daily note for `noteDate` is the active one. */
export type IsActiveDailyDate = (noteDate: string) => boolean;

/**
 * Decides whether the daily note for `noteDate` is "active", meaning it is the
 * note that should list still-open tasks. Past notes are a record of what was
 * closed on the day, so they must not repeat the current backlog.
 *
 * Today and any future note is active. When today's note does not exist, the
 * latest existing note takes over — this keeps open tasks visible on the day's
 * note before it is created, and on the last note written if a day is skipped.
 *
 * Both rules collapse into the two comparisons below: when today's note does
 * exist, `latestExistingDate` is already today or later, so the second check
 * cannot add a past note.
 *
 * All arguments are `YYYY-MM-DD`, which compares chronologically as a string.
 */
export function isActiveDailyDate({
	noteDate,
	today,
	latestExistingDate,
}: {
	noteDate: string;
	today: string;
	latestExistingDate: string | null;
}): boolean {
	if (!isDailyNoteDateString(noteDate)) {
		// The query does not run in a dated note — `_templates/Daily note
		// template.md` is the one such case. There is no day to scope to, so
		// list open tasks instead of silently hiding them.
		return true;
	}

	return noteDate >= today || noteDate === latestExistingDate;
}

/**
 * Builds the predicate used by the daily task filter, backed by the vault.
 *
 * The latest existing daily note date needs a scan of every markdown file, so
 * it is cached and only recomputed after a daily note is added, removed or
 * renamed. The filter runs once per task per query — over 600 daily notes, an
 * uncached scan would be run thousands of times.
 *
 * Today's date is read fresh on every call instead, so the answer stays correct
 * across midnight without any cache to invalidate.
 */
export function createIsActiveDailyDate(plugin: Plugin): IsActiveDailyDate {
	let cachedLatestDate: string | null = null;
	let isCached = false;

	const invalidate = (): void => {
		isCached = false;
	};

	plugin.registerEvent(
		plugin.app.vault.on('create', (file) => {
			if (isDailyNoteFile(file)) {
				invalidate();
			}
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on('delete', (file) => {
			if (isDailyNoteFile(file)) {
				invalidate();
			}
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			// A rename can either create or remove a daily note date, so both
			// the new and the old path matter.
			if (isDailyNoteFile(file) || getDailyNoteDateFromPath(oldPath)) {
				invalidate();
			}
		}),
	);

	const getLatestExistingDate = (): string | null => {
		if (!isCached) {
			cachedLatestDate = findLatestDailyNoteDate(plugin);
			isCached = true;
		}

		return cachedLatestDate;
	};

	return (noteDate) =>
		isActiveDailyDate({
			noteDate,
			today: formatDailyNoteBasename(new Date()),
			latestExistingDate: getLatestExistingDate(),
		});
}

/** Returns the newest `YYYY-MM-DD` daily note in the vault, or `null` if none. */
function findLatestDailyNoteDate(plugin: Plugin): string | null {
	let latest: string | null = null;

	for (const file of plugin.app.vault.getMarkdownFiles()) {
		const date = getDailyNoteDateFromPath(file.path);

		if (date !== null && (latest === null || date > latest)) {
			latest = date;
		}
	}

	return latest;
}
