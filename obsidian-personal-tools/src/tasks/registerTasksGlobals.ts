import { Plugin } from 'obsidian';
import { createIsActiveDailyDate } from './activeDailyDate';
import {
	DailyFilterQuery,
	DailyFilterTask,
	filterTasksForDaily,
} from './filterTasksForDaily';
import { DailySortTask, sortKeyForDaily } from './sortKeyForDaily';

/**
 * Helpers exposed on `window.senaevPersonalTools` so that `filter by function`
 * expressions inside ```tasks``` code blocks can call them. The Tasks plugin
 * evaluates those expressions as plain JavaScript, so a global is the only way
 * to reach plugin code from a note.
 */
export interface SenaevPersonalToolsApi {
	filterTasksForDaily(args: {
		task: DailyFilterTask;
		query: DailyFilterQuery;
	}): boolean;
	sortKeyForDaily(args: { task: DailySortTask }): string;
}

declare global {
	interface Window {
		senaevPersonalTools?: SenaevPersonalToolsApi;
	}
}

/** Publishes the global API used by ```tasks``` queries, until plugin unload. */
export function registerTasksGlobals(plugin: Plugin): void {
	const isActiveDailyDate = createIsActiveDailyDate(plugin);

	window.senaevPersonalTools = {
		filterTasksForDaily: ({ task, query }) =>
			filterTasksForDaily(task, query, isActiveDailyDate),
		sortKeyForDaily: ({ task }) => sortKeyForDaily(task),
	};

	plugin.register(() => {
		delete window.senaevPersonalTools;
	});
}
