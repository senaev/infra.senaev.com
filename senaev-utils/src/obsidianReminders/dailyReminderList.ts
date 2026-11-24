import type { IsoDay } from './isoDay';
import {
    REMINDER_PRIORITIES, type ReminderPriority, type ReminderStatus,
} from './reminderLine';

// The reminder list of a daily note, shared by the senaev-personal-tools Obsidian plugin
// (`filter by function` / `sort by function` in the daily note template) and the
// obsidian-sync MCP tools, so both show the same reminders in the same order.

/** Root folders whose reminders are never listed, as the vault's Tasks global query says. */
export const REMINDER_EXCLUDED_ROOT_FOLDERS = [
    '_templates',
    'plugins/senaev-personal-tools',
] as const;

/** Reminders in dot-folders (`.obsidian`, `.trash`, …) and the excluded root folders are ignored. */
export function isReminderPathExcluded(path: string): boolean {
    return path.split('/').some((part) => part.startsWith('.')) || REMINDER_EXCLUDED_ROOT_FOLDERS.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

const DAILY_NOTE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Folder holding periodic notes, whose own reminders are never listed in a daily note. */
const PERIODIC_FOLDER_PREFIX = 'periodic/';

const PRIORITIES_LISTED_WITHOUT_DUE_DATE: readonly ReminderPriority[] = [
    'highest',
    'high',
    'medium',
    'normal',
];

/**
 * Whether the daily note for `noteDate` is the "active" one, which lists the open reminders.
 * Past notes are a record of what was closed on the day, so they do not repeat the
 * backlog. Only today and future notes are active, also when today's note does not exist.
 * A note whose name is not a date (the template) is active, so that it shows open reminders
 * instead of looking broken.
 */
export function isActiveDailyDate({ noteDate, today }: { noteDate: string; today: IsoDay }): boolean {
    if (!DAILY_NOTE_DATE.test(noteDate)) {
        return true;
    }

    return noteDate >= today;
}

export type DailyReminder = {
    path: string;
    status: ReminderStatus;
    priority: ReminderPriority;
    date: IsoDay | null;
    closedDate: IsoDay | null;
};

/**
 * Whether a reminder belongs in the reminder list of the daily note for `noteDate`.
 *
 * A closed reminder is listed on the note of the day it was closed on. An open reminder is
 * listed only on the active note, when its date is on or before the note's day, or has no
 * date and normal or higher priority. Reminders in periodic notes are never listed.
 */
export function isReminderInDailyNote(reminder: DailyReminder, { noteDate, isActiveNote }: { noteDate: string; isActiveNote: boolean }): boolean {
    if (reminder.path.startsWith(PERIODIC_FOLDER_PREFIX)) {
        return false;
    }

    if (reminder.status !== 'open') {
        return reminder.closedDate === noteDate;
    }

    if (!isActiveNote) {
        return false;
    }

    if (reminder.date !== null) {
        return reminder.date <= noteDate;
    }

    return PRIORITIES_LISTED_WITHOUT_DUE_DATE.includes(reminder.priority);
}

export type SortableReminder = {
    priority: ReminderPriority;
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
 * `sort by function` accepts only one scalar. Compare keys with `compareReminderSortKeys`.
 */
export function getReminderSortKey(reminder: SortableReminder): string {
    return [
        String(REMINDER_PRIORITIES.indexOf(reminder.priority)),
        reminder.path,
        String(reminder.line).padStart(7, '0'),
    ].join(TIER_SEPARATOR);
}

/** The comparison the Tasks plugin applies to `sort by function` keys. */
export function compareReminderSortKeys(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true });
}

export function compareReminders(a: SortableReminder, b: SortableReminder): number {
    return compareReminderSortKeys(getReminderSortKey(a), getReminderSortKey(b));
}
