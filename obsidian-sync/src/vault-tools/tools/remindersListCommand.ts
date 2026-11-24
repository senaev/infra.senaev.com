import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import {
    compareReminders, isActiveDailyDate, isReminderInDailyNote,
} from 'senaev-utils/src/obsidianReminders/dailyReminderList';
import { todayIsoDay } from 'senaev-utils/src/obsidianReminders/isoDay';
import type { ReminderPriority, ReminderStatus } from 'senaev-utils/src/obsidianReminders/reminderLine';
import { REMINDERS_TIME_ZONE } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';

import type { NoteScope } from '../noteScope';
import { createTextMatcher, type TextQuery } from '../textQuery';
import { scanVaultReminders, type VaultReminder } from '../reminders/scanVaultReminders';
import type { VaultToolsConfig } from '../vaultToolsConfig';

const MAX_REPORTED_ERRORS = 20;

export type DayRange = {
    from: string | undefined;
    to: string | undefined;
};

export type RemindersListCommandInput = {
    scope: NoteScope;
    /** `today` or `YYYY-MM-DD`. */
    dailyNote: string | undefined;
    statuses: readonly ReminderStatus[] | undefined;
    priorities: readonly ReminderPriority[] | undefined;
    textQuery: TextQuery | undefined;
    dates: DayRange;
    closed: DayRange;
    offset: number;
    limit: number;
};

function isInRange(day: string | null, { from, to }: DayRange): boolean {
    if (from === undefined && to === undefined) {
        return true;
    }

    return day !== null && (from === undefined || day >= from) && (to === undefined || day <= to);
}

function createDailyNoteFilter(dailyNote: string) {
    const today = todayIsoDay(REMINDERS_TIME_ZONE);
    const noteDate = dailyNote === 'today' ? today : dailyNote;
    const isActiveNote = isActiveDailyDate({
        noteDate,
        today,
    });

    return {
        noteDate,
        isActiveNote,
        matches: (reminder: VaultReminder) => isReminderInDailyNote(reminder, {
            noteDate,
            isActiveNote,
        }),
    };
}

/** Lists the reminders of the notes in scope that match every filter, sorted for a daily note. */
export async function remindersListCommand(config: VaultToolsConfig, input: RemindersListCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const {
        scope, statuses, priorities, textQuery, dates, closed, offset, limit,
    } = input;
    const scan = await scanVaultReminders(config, scope, execution);
    const dailyNote = input.dailyNote === undefined ? null : createDailyNoteFilter(input.dailyNote);
    const matchesText = textQuery === undefined ? null : createTextMatcher(textQuery);
    const reminders = scan.reminders.filter((reminder) => (statuses === undefined || statuses.includes(reminder.status)) && (priorities === undefined || priorities.includes(reminder.priority)) && (matchesText === null || matchesText(reminder.description)) && isInRange(reminder.date, dates) && isInRange(reminder.status === 'open' ? null : reminder.closedDate, closed) && (dailyNote === null || dailyNote.matches(reminder)));

    reminders.sort(compareReminders);

    const page = reminders.slice(offset, offset + limit);
    const nextOffset = offset + page.length < reminders.length ? offset + page.length : null;

    return {
        ...dailyNote !== null && {
            dailyNote: {
                date: dailyNote.noteDate,
                isActive: dailyNote.isActiveNote,
            },
        },
        total: reminders.length,
        offset,
        limit,
        nextOffset,
        scannedFiles: scan.scannedFiles,
        complete: scan.readErrors.length === 0 && scan.walkErrors.length === 0,
        parseErrors: {
            count: scan.parseErrors.length,
            items: scan.parseErrors.slice(0, MAX_REPORTED_ERRORS),
        },
        readErrors: scan.readErrors.slice(0, MAX_REPORTED_ERRORS),
        walkErrors: scan.walkErrors.slice(0, MAX_REPORTED_ERRORS),
        reminders: page,
    };
}

export type RemindersListCommandResult = Awaited<ReturnType<typeof remindersListCommand>>;
