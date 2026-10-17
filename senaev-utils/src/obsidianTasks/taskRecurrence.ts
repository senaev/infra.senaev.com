import { RRule } from 'rrule';

import {
    isoDayToUtcDate, type IsoDay, utcDateToIsoDay,
} from './isoDay';

// Recurrence as the Obsidian Tasks plugin reads it: the text after 🔁, parsed by
// `rrule`, with an optional ` when done` that counts the next date from the completion
// day instead of from the due date.

const RECURRENCE = /^([a-zA-Z0-9, !]+?)( when done)?$/iu;

type ParsedRecurrence = {
    options: NonNullable<ReturnType<typeof RRule.parseText>>;
    isWhenDone: boolean;
};

function parseRecurrence(text: string): ParsedRecurrence | null {
    const match = RECURRENCE.exec(text);

    if (match === null) {
        return null;
    }

    try {
        const options = RRule.parseText((match[1] ?? '').trim());

        return options === null || options.freq === undefined
            ? null
            : {
                options,
                isWhenDone: match[2] !== undefined,
            };
    } catch {
        return null;
    }
}

/** An error message, or `null` when the Tasks plugin can read the recurrence. */
export function validateRecurrence(text: string): string | null {
    return parseRecurrence(text) === null
        ? `invalid recurrence "${text}"; use the Tasks plugin wording, e.g. "every week", "every 3 months", "every 90 days when done"`
        : null;
}

function monthIndex(date: Date): number {
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function lastDayOfMonth(monthIndexValue: number): Date {
    const date = new Date(0);

    date.setUTCFullYear(Math.floor(monthIndexValue / 12), (monthIndexValue % 12) + 1, 0);

    return date;
}

/**
 * Like the Tasks plugin, "every month" from January 31 gives the end of February, not
 * March 31: a monthly or yearly rule without "on" never skips a whole period.
 */
function clampSkippedPeriod(rule: RRule, base: Date, next: Date): Date {
    const text = rule.toText();
    const month = /every( \d+)? months?/u.exec(text);
    const year = /every( \d+)? years?/u.exec(text);

    if (text.includes(' on ') || (month === null && year === null)) {
        return next;
    }

    const periodMonths = month === null
        ? 12 * Number(year?.[1] ?? 1)
        : Number(month[1] ?? 1);
    const targetMonth = monthIndex(base) + periodMonths;

    return monthIndex(next) > targetMonth ? lastDayOfMonth(targetMonth) : next;
}

/**
 * The due date of the next occurrence when a recurring task is completed: the due date
 * plus the interval, or the completion day plus the interval for ` when done`.
 */
export function getNextRecurrenceDueDate({
    recurrence, dueDate, completedOn,
}: { recurrence: string; dueDate: IsoDay; completedOn: IsoDay }): IsoDay {
    const parsed = parseRecurrence(recurrence);

    if (parsed === null) {
        throw new Error(`Invalid recurrence: ${recurrence}`);
    }

    const base = isoDayToUtcDate(parsed.isWhenDone ? completedOn : dueDate);
    const rule = new RRule({
        ...parsed.options,
        dtstart: base,
    });
    const endOfBaseDay = new Date(base.getTime() + (24 * 60 * 60 * 1000) - 1);
    const next = rule.after(endOfBaseDay);

    if (next === null) {
        throw new Error(`The recurrence "${recurrence}" has no next date`);
    }

    return utcDateToIsoDay(clampSkippedPeriod(rule, base, next));
}
