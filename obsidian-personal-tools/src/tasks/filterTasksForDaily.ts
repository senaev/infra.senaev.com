import {
	isTaskInDailyNote,
	type DailyTask,
} from 'senaev-utils/src/obsidianTasks/dailyTasks';
import {
	TASK_PRIORITIES,
	type TaskPriority,
	type TaskStatus,
} from 'senaev-utils/src/obsidianTasks/taskLine';
import { IsActiveDailyDate } from './activeDailyDate';

/** The subset of a moment-like date that the filter needs. */
interface TaskDate {
	format(pattern: 'YYYY-MM-DD'): string;
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

function toStatus(type: string): TaskStatus {
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
export function toTaskPriority(priorityName: string): TaskPriority {
	const name = priorityName.toLowerCase();

	return TASK_PRIORITIES.find((priority) => priority === name) ?? 'normal';
}

/** The plain data that the shared daily filter in senaev-utils takes. */
export function toDailyTask(task: DailyFilterTask): DailyTask {
	const status = toStatus(task.status.type);
	const closedOn =
		status === 'done' ? task.done.moment : status === 'cancelled' ? task.cancelled.moment : null;

	return {
		path: task.file.path,
		status,
		priority: toTaskPriority(task.priorityName),
		dueDate: task.dueDate?.format('YYYY-MM-DD') ?? null,
		closedDate: closedOn?.format('YYYY-MM-DD') ?? null,
	};
}

/**
 * Whether `task` belongs in the task list of the daily note that `query` runs in.
 * The rules live in senaev-utils (`isTaskInDailyNote`), shared with the Obsidian MCP
 * tools of infra.senaev.com, so ChatGPT sees the same daily list as Obsidian.
 */
export function filterTasksForDaily(
	task: DailyFilterTask,
	query: DailyFilterQuery,
	isActiveDailyDate: IsActiveDailyDate,
): boolean {
	// `2026-08-01.md` → `2026-08-01`.
	const noteDate = query.file.filename.split('.')[0] ?? '';

	return isTaskInDailyNote(toDailyTask(task), {
		noteDate,
		isActiveNote: isActiveDailyDate(noteDate),
	});
}
