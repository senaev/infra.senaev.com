import { IsActiveDailyDate } from './activeDailyDate';

/**
 * Task statuses that mean the task is no longer actionable.
 * Mirrors the Tasks plugin `task.status.type` values.
 */
const CLOSED_STATUS_TYPES: readonly string[] = ['DONE', 'CANCELLED'];

/**
 * Priorities considered important enough to surface in a daily note even when
 * the task has no due date. Mirrors the Tasks plugin `task.priorityName` values.
 */
const NORMAL_OR_HIGHER_PRIORITIES: readonly string[] = [
	'Normal',
	'Medium',
	'High',
	'Highest',
];

/** Folder holding periodic notes, whose own tasks must never be listed. */
const PERIODIC_FOLDER_PREFIX = 'periodic/';

/** The subset of a moment-like date that the filter needs. */
interface TaskDate {
	isSame(other: string, granularity: 'day'): boolean;
	isSameOrBefore(other: string, granularity: 'day'): boolean;
}

/** The subset of the Tasks plugin `task` object that the filter reads. */
export interface DailyFilterTask {
	status: { type: string };
	priorityName: string;
	done: { moment: TaskDate | null };
	cancelled: { moment: TaskDate | null };
	dueDate: TaskDate | null;
	file: { path: string };
}

/** The subset of the Tasks plugin `query` object that the filter reads. */
export interface DailyFilterQuery {
	file: { filename: string };
}

/** Turns a query file name such as `2026-08-01.md` into the date `2026-08-01`. */
function getQueryDate(query: DailyFilterQuery): string {
	return query.file.filename.split('.')[0] ?? '';
}

/**
 * Decides whether `task` belongs in the task list of the daily note that `query`
 * runs in.
 *
 * A closed (done or cancelled) task is listed on the note for the day it was
 * closed on, so every past note stays a record of what was finished that day.
 *
 * Still-open tasks are listed only on the active note (see `isActiveDailyDate`),
 * and only when they are due on or before its date, or have no due date at all
 * and are of normal or higher priority. Without this, the whole open backlog
 * would be repeated in every past daily note.
 *
 * Tasks that live inside periodic notes are always excluded, so daily notes
 * never echo each other's checklists.
 */
export function filterTasksForDaily(
	task: DailyFilterTask,
	query: DailyFilterQuery,
	isActiveDailyDate: IsActiveDailyDate,
): boolean {
	if (task.file.path.startsWith(PERIODIC_FOLDER_PREFIX)) {
		return false;
	}

	const noteDate = getQueryDate(query);

	if (CLOSED_STATUS_TYPES.includes(task.status.type)) {
		const closedOn = task.done.moment ?? task.cancelled.moment;
		return closedOn?.isSame(noteDate, 'day') === true;
	}

	if (!isActiveDailyDate(noteDate)) {
		return false;
	}

	const { dueDate } = task;
	if (dueDate) {
		// Overdue and due-today tasks are listed; future ones stay hidden.
		return dueDate.isSameOrBefore(noteDate, 'day');
	}

	return NORMAL_OR_HIGHER_PRIORITIES.includes(task.priorityName);
}
