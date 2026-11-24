import {
	isReminderInDailyNote,
	type DailyReminder,
} from 'senaev-utils/src/obsidianReminders/dailyReminderList';
import {
	REMINDER_PRIORITIES,
	type ReminderPriority,
	type ReminderStatus,
} from 'senaev-utils/src/obsidianReminders/reminderLine';
import { IsActiveDailyDate } from './activeDailyDate';

/** The subset of a moment-like date that the filter needs. */
interface ReminderDate {
	format(pattern: 'YYYY-MM-DD'): string;
}

/** The subset of the Tasks plugin `task` object that the filter reads. */
export interface DailyFilterReminder {
	status: { type: string };
	priorityName: string;
	done: { moment: ReminderDate | null };
	cancelled: { moment: ReminderDate | null };
	dueDate: ReminderDate | null;
	file: { path: string };
}

/** The subset of the Tasks plugin `query` object that the filter reads. */
export interface DailyFilterQuery {
	file: { filename: string };
}

function toStatus(type: string): ReminderStatus {
	switch (type) {
		case 'DONE':
			return 'done';
		case 'CANCELLED':
			return 'cancelled';
		default:
			return 'open';
	}
}

/** The Tasks plugin's priority names (`High`, `Normal`, …) in senaev-utils' words. */
export function toReminderPriority(priorityName: string): ReminderPriority {
	const name = priorityName.toLowerCase();

	return REMINDER_PRIORITIES.find((priority) => priority === name) ?? 'normal';
}

/** The plain data that the shared daily filter in senaev-utils takes. */
export function toDailyReminder(task: DailyFilterReminder): DailyReminder {
	const status = toStatus(task.status.type);
	const closedOn =
		status === 'done' ? task.done.moment : status === 'cancelled' ? task.cancelled.moment : null;

	return {
		path: task.file.path,
		status,
		priority: toReminderPriority(task.priorityName),
		date: task.dueDate?.format('YYYY-MM-DD') ?? null,
		closedDate: closedOn?.format('YYYY-MM-DD') ?? null,
	};
}

/**
 * Whether the reminder `task` belongs in the reminder list of the daily note that `query` runs in.
 * The rules live in senaev-utils (`isReminderInDailyNote`), shared with the Obsidian MCP
 * tools of infra.senaev.com, so ChatGPT sees the same daily list as Obsidian.
 */
export function filterRemindersForDaily(
	task: DailyFilterReminder,
	query: DailyFilterQuery,
	isActiveDailyDate: IsActiveDailyDate,
): boolean {
	// `2026-08-01.md` → `2026-08-01`.
	const noteDate = query.file.filename.split('.')[0] ?? '';

	return isReminderInDailyNote(toDailyReminder(task), {
		noteDate,
		isActiveNote: isActiveDailyDate(noteDate),
	});
}
