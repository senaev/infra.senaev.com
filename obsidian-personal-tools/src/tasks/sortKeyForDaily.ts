/**
 * Joins the sort tiers into one key.
 *
 * `|` is deliberate: Obsidian forbids it in file names, so it cannot appear in
 * the file-name tier and the boundary between tiers stays unambiguous. It is
 * also ordinary punctuation, which the Tasks plugin's comparator keeps
 * significant — it calls `localeCompare` without `ignorePunctuation`, so unlike
 * a control character `|` is never collated away.
 */
const TIER_SEPARATOR = '|';

/** Priority used when a task carries no parseable priority (Tasks' "None"). */
const NORMAL_PRIORITY = 3;

/** The subset of the Tasks plugin `task` object that the sort key reads. */
export interface DailySortTask {
	priorityNumber: number;
	description: string;
	file: { filename: string };
}

/**
 * Builds the single sort key for a task in a daily note, ordering by
 * priority (highest first), then file name, then description — all ascending.
 *
 * The Tasks plugin only accepts one scalar per `sort by function`, and refuses
 * to compare keys of different types, so every tier is packed into one string.
 * Priority leads as a single digit (`0` is Highest, `5` is Lowest), which makes
 * plain ascending order also mean highest-priority-first.
 *
 * Note that the plugin compares the returned string with `numeric: true`, so
 * digit runs inside file names and descriptions sort naturally (`2` before
 * `10`) rather than strictly lexicographically.
 */
export function sortKeyForDaily(task: DailySortTask): string {
	const priority = Number.isFinite(task.priorityNumber)
		? task.priorityNumber
		: NORMAL_PRIORITY;

	return [
		String(priority),
		task.file.filename,
		task.description,
	].join(TIER_SEPARATOR);
}
