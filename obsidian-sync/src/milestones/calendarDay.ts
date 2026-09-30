/** A day of the calendar, with `month` 1-based so it reads like a date. */
export interface CalendarDay {
    year: number;
    month: number;
    date: number;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDate(year: number, monthIndex: number, date: number): Date {
    // `Date.UTC` maps years 0-99 onto 1900-1999, `setUTCFullYear` does not.
    const result = new Date(0);

    result.setUTCFullYear(year, monthIndex, date);

    return result;
}

function toCalendarDay(date: Date): CalendarDay {
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        date: date.getUTCDate(),
    };
}

/** Parses a strict `YYYY-MM-DD`. Days that do not exist, such as `2026-02-30`, give `null`. */
export function parseIsoCalendarDay(value: string): CalendarDay | null {
    const match = ISO_DAY.exec(value);

    if (!match) {
        return null;
    }

    const day = {
        year: Number(match[1]),
        month: Number(match[2]),
        date: Number(match[3]),
    };
    const normalized = toCalendarDay(utcDate(day.year, day.month - 1, day.date));

    if (normalized.month !== day.month || normalized.date !== day.date) {
        return null;
    }

    return day;
}

export function formatIsoCalendarDay(day: CalendarDay): string {
    const month = String(day.month).padStart(2, '0');
    const date = String(day.date).padStart(2, '0');

    return `${String(day.year).padStart(4, '0')}-${month}-${date}`;
}

export function addDays(day: CalendarDay, days: number): CalendarDay {
    return toCalendarDay(utcDate(day.year, day.month - 1, day.date + days));
}

export function todayInTimeZone(timeZone: string, now: Date = new Date()): CalendarDay {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).formatToParts(now);

    const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);

    return {
        year: read('year'),
        month: read('month'),
        date: read('day'),
    };
}
