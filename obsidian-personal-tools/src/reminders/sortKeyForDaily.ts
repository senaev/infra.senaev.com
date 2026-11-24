import { getReminderSortKey } from 'senaev-utils/src/obsidianReminders/dailyReminderList';
import { REMINDER_PRIORITIES } from 'senaev-utils/src/obsidianReminders/reminderLine';

/** The subset of the Tasks plugin `task` object that the sort key reads. */
export interface DailySortReminder {
	/** `0` is Highest … `5` is Lowest. */
	priorityNumber: number;
	file: { path: string };
	/** `lineNumber` is 0-based. */
	taskLocation: { lineNumber: number };
}

/**
 * The single sort key for a reminder in a daily note: priority (highest first), then file
 * path, then line. The key format lives in senaev-utils (`getReminderSortKey`), shared with
 * the Obsidian MCP tools, which compare the keys the same way the Tasks plugin does.
 */
export function sortKeyForDaily(task: DailySortReminder): string {
	return getReminderSortKey({
		priority: REMINDER_PRIORITIES[task.priorityNumber] ?? 'normal',
		path: task.file.path,
		line: task.taskLocation.lineNumber + 1,
	});
}
