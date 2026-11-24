import { Plugin } from 'obsidian';
import { isActiveDailyDateFromToday } from './activeDailyDate';
import {
	DailyFilterQuery,
	DailyFilterReminder,
	filterRemindersForDaily,
} from './filterRemindersForDaily';
import { DailySortReminder, sortKeyForDaily } from './sortKeyForDaily';

/**
 * Helpers exposed on `window.senaevPersonalTools` so that `filter by function`
 * expressions inside ```tasks``` code blocks can call them. The Tasks plugin
 * evaluates those expressions as plain JavaScript, so a global is the only way
 * to reach plugin code from a note.
 */
type FilterRemindersForDaily = (args: {
	/** The Tasks plugin passes each checkbox line as `task`. */
	task: DailyFilterReminder;
	query: DailyFilterQuery;
}) => boolean;

export interface SenaevPersonalToolsApi {
	filterRemindersForDaily: FilterRemindersForDaily;
	/**
	 * The old name of `filterRemindersForDaily`. About 750 existing daily notes call it,
	 * so it stays; the daily-note template writes the new name.
	 */
	filterTasksForDaily: FilterRemindersForDaily;
	sortKeyForDaily(args: { task: DailySortReminder }): string;
}

declare global {
	interface Window {
		senaevPersonalTools?: SenaevPersonalToolsApi;
	}
}

/** Publishes the global API used by ```tasks``` queries, until plugin unload. */
export function registerRemindersGlobals(plugin: Plugin): void {
	const filter: FilterRemindersForDaily = ({ task, query }) =>
		filterRemindersForDaily(task, query, isActiveDailyDateFromToday);

	window.senaevPersonalTools = {
		filterRemindersForDaily: filter,
		filterTasksForDaily: filter,
		sortKeyForDaily: ({ task }) => sortKeyForDaily(task),
	};

	plugin.register(() => {
		delete window.senaevPersonalTools;
	});
}
