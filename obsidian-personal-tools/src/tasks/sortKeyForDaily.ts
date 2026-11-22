import { getTaskSortKey } from 'senaev-utils/src/obsidianTasks/dailyTasks';
import { TASK_PRIORITIES } from 'senaev-utils/src/obsidianTasks/taskLine';

/** The subset of the Tasks plugin `task` object that the sort key reads. */
export interface DailySortTask {
	/** `0` is Highest … `5` is Lowest. */
	priorityNumber: number;
	file: { path: string };
	/** `lineNumber` is 0-based. */
	taskLocation: { lineNumber: number };
}

/**
 * The single sort key for a task in a daily note: priority (highest first), then file
 * path, then line. The key format lives in senaev-utils (`getTaskSortKey`), shared with
 * the Obsidian MCP tools, which compare the keys the same way the Tasks plugin does.
 */
export function sortKeyForDaily(task: DailySortTask): string {
	return getTaskSortKey({
		priority: TASK_PRIORITIES[task.priorityNumber] ?? 'normal',
		path: task.file.path,
		line: task.taskLocation.lineNumber + 1,
	});
}
