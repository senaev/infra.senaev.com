import { Plugin } from 'obsidian';
import { isActiveDailyDate } from 'senaev-utils/src/obsidianTasks/dailyTasks';
import {
	formatDailyNoteBasename,
	getDailyNoteDateFromPath,
	isDailyNoteFile,
} from '../dailyNote/dailyNotePath';

/** The rule lives in senaev-utils, shared with the Obsidian MCP tools. */
export { isActiveDailyDate };

/** A predicate telling whether the daily note for `noteDate` is the active one. */
export type IsActiveDailyDate = (noteDate: string) => boolean;

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
