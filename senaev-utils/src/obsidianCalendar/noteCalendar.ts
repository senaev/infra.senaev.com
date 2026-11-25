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

/** The note that a calendar is drawn for. */
export type CalendarNote = {
    /** Name without the extension, e.g. `Gym`: what a link to the note ends with. */
    name: string;
    /** Vault path, e.g. `health/Gym.md`. */
    path: string;
};

/**
 * Resolves the path of a wiki-link, e.g. `Gym`, `work/Calendar` or `../../Journal`, written in the
 * note at `sourcePath`, to the vault path of the note it opens, or `null` when there is none.
 * Obsidian's `metadataCache.getFirstLinkpathDest` does exactly this.
 */
export type ResolveLink = (linkpath: string, sourcePath: string) => string | null;

/** The part of every `[[…]]` before a `#heading` or `|alias`: `[[Gym#Plan|Training]]` gives `Gym`. */
export function wikiLinkPaths(text: string): string[] {
    return [...text.matchAll(/\[\[([^\]|#]+)/gu)].map((match) => (match[1] ?? '').trim());
}

/**
 * Whether the text has a link that opens the note. The daily-note template writes a path when two
 * notes share a name (`[[work/Calendar|…]]`), so a link is resolved the way Obsidian does it
 * rather than compared with the name. The name only skips the resolving of unrelated reminders.
 */
export function linksToNote(
    description: string,
    sourcePath: string,
    note: CalendarNote,
    resolveLink: ResolveLink
): boolean {
    return description.includes(note.name) && wikiLinkPaths(description).some((linkpath) => resolveLink(linkpath, sourcePath) === note.path);
}

/**
 * One entry per reminder of a daily note (`periodic/day/YYYY-MM-DD.md`) that links to the note,
 * dated by that daily note. A reminder in any other file is ignored: it has no day.
 */
export function reminderCalendarEntries(
    reminders: readonly CalendarReminder[],
    note: CalendarNote,
    resolveLink: ResolveLink
): CalendarEntry<ReminderStatus>[] {
    const entries: CalendarEntry<ReminderStatus>[] = [];

    for (const {
        path, description, status,
    } of reminders) {
        const day = dailyDateFromPath(path);

        if (day !== null && linksToNote(description, path, note, resolveLink)) {
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

export function buildReminderCalendar(
    reminders: readonly CalendarReminder[],
    note: CalendarNote,
    resolveLink: ResolveLink
) {
    return buildCalendarModel(REMINDER_CALENDAR_KINDS, reminderCalendarEntries(reminders, note, resolveLink));
}

export function buildMentionCalendar(
    resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>,
    notePath: string
) {
    return buildCalendarModel(MENTION_CALENDAR_KINDS, mentionCalendarEntries(resolvedLinks, notePath));
}
