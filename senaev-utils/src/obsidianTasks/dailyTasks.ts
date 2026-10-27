import type { IsoDay } from './isoDay';
import {
    TASK_PRIORITIES, type TaskPriority, type TaskStatus,
} from './taskLine';

// The task list of a daily note, shared by the senaev-personal-tools Obsidian plugin
// (`filter by function` / `sort by function` in the daily note template) and the
// obsidian-sync MCP tools, so both show the same tasks in the same order.

/** Root folders whose tasks are never listed, as the vault's Tasks global query says. */
export const TASK_EXCLUDED_ROOT_FOLDERS = [
    '_templates',
    'plugins/senaev-personal-tools',
] as const;

/** Tasks in dot-folders (`.obsidian`, `.trash`, …) and the excluded root folders are ignored. */
export function isTaskPathExcluded(path: string): boolean {
    return path.split('/').some((part) => part.startsWith('.')) || TASK_EXCLUDED_ROOT_FOLDERS.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

const DAILY_NOTE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Folder holding periodic notes, whose own tasks are never listed in a daily note. */
const PERIODIC_FOLDER_PREFIX = 'periodic/';

const PRIORITIES_LISTED_WITHOUT_DUE_DATE: readonly TaskPriority[] = [
    'highest',
    'high',
    'medium',
    'normal',
];

/**
 * Whether the daily note for `noteDate` is the "active" one, which lists the open tasks.
 * Past notes are a record of what was closed on the day, so they do not repeat the
 * backlog. Only today and future notes are active, also when today's note does not exist.
 * A note whose name is not a date (the template) is active, so that it shows open tasks
 * instead of looking broken.
 */
export function isActiveDailyDate({ noteDate, today }: { noteDate: string; today: IsoDay }): boolean {
    if (!DAILY_NOTE_DATE.test(noteDate)) {
        return true;
    }

    return noteDate >= today;
}

export type DailyTask = {
    path: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: IsoDay | null;
    closedDate: IsoDay | null;
};

/**
 * Whether a task belongs in the task list of the daily note for `noteDate`.
 *
 * A closed task is listed on the note of the day it was closed on. An open task is
 * listed only on the active note, when it is due on or before the note's day, or has no
 * due date and normal or higher priority. Tasks in periodic notes are never listed.
 */
export function isTaskInDailyNote(task: DailyTask, { noteDate, isActiveNote }: { noteDate: string; isActiveNote: boolean }): boolean {
    if (task.path.startsWith(PERIODIC_FOLDER_PREFIX)) {
        return false;
    }

    if (task.status !== 'open') {
        return task.closedDate === noteDate;
    }

    if (!isActiveNote) {
        return false;
    }

    if (task.dueDate !== null) {
        return task.dueDate <= noteDate;
    }

    return PRIORITIES_LISTED_WITHOUT_DUE_DATE.includes(task.priority);
}

export type SortableTask = {
    priority: TaskPriority;
    path: string;
    /** 1-based line number in the file. */
    line: number;
};

/**
 * `|` cannot appear in an Obsidian file name, so the tiers never run into each other.
 * The Tasks plugin collates the key with `localeCompare`, which keeps `|` significant.
 */
const TIER_SEPARATOR = '|';

/**
 * One string key for priority (highest first) → path → line, because the Tasks plugin's
 * `sort by function` accepts only one scalar. Compare keys with `compareTaskSortKeys`.
 */
export function getTaskSortKey(task: SortableTask): string {
    return [
        String(TASK_PRIORITIES.indexOf(task.priority)),
        task.path,
        String(task.line).padStart(7, '0'),
    ].join(TIER_SEPARATOR);
}

/** The comparison the Tasks plugin applies to `sort by function` keys. */
export function compareTaskSortKeys(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true });
}

export function compareTasks(a: SortableTask, b: SortableTask): number {
    return compareTaskSortKeys(getTaskSortKey(a), getTaskSortKey(b));
}
