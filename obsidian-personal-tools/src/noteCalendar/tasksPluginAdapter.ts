import type { App, EventRef, Workspace } from 'obsidian';
import { DAILY_NOTE_FOLDER } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import type { CalendarReminder } from 'senaev-utils/src/obsidianCalendar/noteCalendar';

/**
 * The only place that touches the Obsidian Tasks plugin. `getTasks()` is not a documented API,
 * so this file is the one to fix if an update of the plugin breaks it.
 */

const TASKS_PLUGIN_ID = 'obsidian-tasks-plugin';

/** Fired on the workspace each time the Tasks plugin has rebuilt its cache. */
const TASKS_CACHE_UPDATE_EVENT = 'obsidian-tasks-plugin:cache-update';

/** The subset of a Tasks plugin `Task` that the calendar reads. */
interface TasksPluginTask {
	description: string;
	file: { path: string };
	status: { type: string };
}

interface TasksPlugin {
	getTasks(): TasksPluginTask[];
}

function getTasksPlugin(app: App): TasksPlugin | null {
	const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
	const plugin = plugins?.[TASKS_PLUGIN_ID] as Partial<TasksPlugin> | undefined;

	return typeof plugin?.getTasks === 'function' ? (plugin as TasksPlugin) : null;
}

function toCalendarStatus(type: string): CalendarReminder['status'] | null {
	switch (type) {
		case 'DONE':
			return 'done';
		case 'CANCELLED':
			return 'cancelled';
		case 'NON_TASK':
			return null;
		default:
			return 'open';
	}
}

/**
 * The reminders of daily notes, or `null` while the Tasks plugin is missing or has not
 * finished loading. Other reminders have no day, so they are not even returned.
 */
export function getDailyNoteReminders(app: App): CalendarReminder[] | null {
	const plugin = getTasksPlugin(app);

	if (!plugin) {
		return null;
	}

	let tasks: TasksPluginTask[];

	try {
		tasks = plugin.getTasks();
	} catch (error) {
		console.warn('senaev-personal-tools: cannot read the Tasks plugin reminders', error);
		return null;
	}

	const reminders: CalendarReminder[] = [];

	for (const task of tasks) {
		const status = toCalendarStatus(task.status.type);

		if (status !== null && task.file.path.startsWith(DAILY_NOTE_FOLDER)) {
			reminders.push({ path: task.file.path, description: task.description, status });
		}
	}

	return reminders;
}

/** Calls `onChange` each time the Tasks plugin reports a new cache. */
export function onTasksCacheUpdate(workspace: Workspace, onChange: () => void): EventRef {
	return (workspace as unknown as {
		on(name: string, callback: () => void): EventRef;
	}).on(TASKS_CACHE_UPDATE_EVENT, onChange);
}
