import { isIsoDay } from '../obsidianTasks/isoDay';

import { type ReminderSource, renderReminders } from './dailyReminders';

/**
 * The daily note template of the owner's vault. Shared by the senaev-personal-tools Obsidian
 * plugin, which fills a new daily note in the app, and obsidian-sync, which creates a missing
 * daily note before it writes a diary record into it. Both must create the same note.
 */

/** Vault-root folder that the daily notes live in, one `YYYY-MM-DD.md` file per day. */
export const DAILY_NOTE_FOLDER = 'periodic/day/';

/**
 * A line of its own in a daily note: new diary records go right above it, so the records
 * of a day stay in the order they were written. The template puts it at the end of the diary block.
 */
export const DIARY_RECORD_MARKER = '⬆️ Daily Note ⬆️';

/** A strict `YYYY-MM-DD` of a day that exists, e.g. `2026-08-01` but not `2026-02-30`. */
export function isDailyNoteDate(value: string): boolean {
    return isIsoDay(value);
}

/** The vault-relative path of the daily note of a day, e.g. `periodic/day/2026-08-01.md`. */
export function dailyNotePath(day: string): string {
    if (!isDailyNoteDate(day)) {
        throw new Error(`Invalid daily note date: ${day}`);
    }

    return `${DAILY_NOTE_FOLDER}${day}.md`;
}

const DAILY_NOTE_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.md$/;

/** Only direct children of the daily folder are daily notes. */
export function dailyDateFromPath(path: string): string | null {
    if (!path.startsWith(DAILY_NOTE_FOLDER)) {
        return null;
    }

    const match = DAILY_NOTE_FILE_NAME.exec(path.slice(DAILY_NOTE_FOLDER.length));

    return match?.[1] !== undefined && isDailyNoteDate(match[1]) ? match[1] : null;
}

/**
 * Clicking an unresolved `[[YYYY-MM-DD]]` link creates the note in the vault root.
 * Returns the daily-folder path such a note belongs to, or `null` for any other path.
 */
export function dailyNotePathForRootNote(path: string): string | null {
    const match = DAILY_NOTE_FILE_NAME.exec(path);

    return match?.[1] !== undefined && isDailyNoteDate(match[1]) ? `${DAILY_NOTE_FOLDER}${match[1]}.md` : null;
}

/** The complete editable daily note; headers and footers remain plugin widgets. */
export function renderDailyNote(day: string, reminders: ReminderSource = { notes: [] }): string {
    if (!isDailyNoteDate(day)) {
        throw new Error(`Invalid daily note date: ${day}`);
    }

    return `
${renderReminders(day, 'morning', reminders)}\`\`\`tasks
filter by function window.senaevPersonalTools.filterTasksForDaily({task, query})
sort by function window.senaevPersonalTools.sortKeyForDaily({task})
\`\`\`

---

${renderReminders(day, 'day', reminders)}
---

${DIARY_RECORD_MARKER}

---

${renderReminders(day, 'evening', reminders)}`;
}

const FRONTMATTER = /^(---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$))([\s\S]*)$/;

/**
 * Pure, idempotent transformation of a daily note at `path`: a blank note and a note with only
 * frontmatter get the template. Any other content, and any path that is not a daily note, is returned
 * unchanged, so existing user text is never replaced.
 */
export function initializeDailyNote(path: string, content: string, reminders?: ReminderSource): string {
    const day = dailyDateFromPath(path);

    if (day === null) {
        return content;
    }

    if (content.trim() === '') {
        return renderDailyNote(day, reminders);
    }

    const frontmatter = FRONTMATTER.exec(content);

    if (frontmatter?.[1] !== undefined && frontmatter[2]?.trim() === '') {
        return `${frontmatter[1]}\n${renderDailyNote(day, reminders)}`;
    }

    return content;
}
