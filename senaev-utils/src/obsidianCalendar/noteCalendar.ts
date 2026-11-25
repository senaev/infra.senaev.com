import { DAILY_NOTE_FOLDER, dailyDateFromPath } from '../obsidianDailyNotes/dailyNoteTemplate';
import { type ReminderStatus } from '../obsidianReminders/reminderLine';

import { type CalendarEntry, buildCalendarModel } from './calendarModel';

/** In priority order for the colour of a day: open work shows through finished work. */
export const REMINDER_CALENDAR_KINDS: readonly ReminderStatus[] = [
    'open',
    'cancelled',
    'done',
];

export const MENTION_CALENDAR_KINDS = ['mention'] as const;

export type MentionCalendarKind = typeof MENTION_CALENDAR_KINDS[number];

/** The part of a reminder that the calendar reads, whichever plugin it came from. */
export type CalendarReminder = {
    /** Vault path of the note that holds the reminder. */
    path: string;
    description: string;
    status: ReminderStatus;
};

/** Whether a reminder text links to the note: `[[Name]]`, or `[[Name#heading…`. */
export function linksToNote(description: string, noteName: string): boolean {
    return description.includes(`[[${noteName}]]`) || description.includes(`[[${noteName}#`);
}

/**
 * One entry per reminder of a daily note (`periodic/day/YYYY-MM-DD.md`) that links to the note,
 * dated by that daily note. A reminder in any other file is ignored: it has no day.
 */
export function reminderCalendarEntries(
    reminders: readonly CalendarReminder[],
    noteName: string
): CalendarEntry<ReminderStatus>[] {
    const entries: CalendarEntry<ReminderStatus>[] = [];

    for (const {
        path, description, status,
    } of reminders) {
        const day = dailyDateFromPath(path);

        if (day !== null && linksToNote(description, noteName)) {
            entries.push({
                day,
                kind: status,
            });
        }
    }

    return entries;
}

/**
 * One entry per daily note that links to the note at `notePath`.
 * `resolvedLinks` has the shape of Obsidian's `metadataCache.resolvedLinks`: source path, then
 * target path, then the number of links.
 */
export function mentionCalendarEntries(
    resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>,
    notePath: string
): CalendarEntry<MentionCalendarKind>[] {
    const entries: CalendarEntry<MentionCalendarKind>[] = [];

    for (const [
        sourcePath,
        targets,
    ] of Object.entries(resolvedLinks)) {
        if (!sourcePath.startsWith(DAILY_NOTE_FOLDER) || (targets[notePath] ?? 0) === 0) {
            continue;
        }

        const day = dailyDateFromPath(sourcePath);

        if (day !== null) {
            entries.push({
                day,
                kind: 'mention',
            });
        }
    }

    return entries;
}

export function buildReminderCalendar(reminders: readonly CalendarReminder[], noteName: string) {
    return buildCalendarModel(REMINDER_CALENDAR_KINDS, reminderCalendarEntries(reminders, noteName));
}

export function buildMentionCalendar(
    resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>,
    notePath: string
) {
    return buildCalendarModel(MENTION_CALENDAR_KINDS, mentionCalendarEntries(resolvedLinks, notePath));
}
