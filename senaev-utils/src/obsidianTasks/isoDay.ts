/** A calendar day as `YYYY-MM-DD`; it compares chronologically as a string. */
export type IsoDay = string;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoDayToUtcDate(day: IsoDay): Date {
    const match = ISO_DAY.exec(day);

    if (match === null) {
        throw new Error(`Not a YYYY-MM-DD day: ${day}`);
    }

    const date = new Date(0);

    // `Date.UTC` maps years 0-99 onto 1900-1999, `setUTCFullYear` does not.
    date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    return date;
}

export function utcDateToIsoDay(date: Date): IsoDay {
    return date.toISOString().slice(0, 10);
}

/** A strict `YYYY-MM-DD` of a day that exists, so `2027-03-00` and `2026-02-30` are not. */
export function isIsoDay(value: string): boolean {
    return ISO_DAY.test(value) && utcDateToIsoDay(isoDayToUtcDate(value)) === value;
}

/** Today in the given time zone, e.g. `Europe/Madrid`. */
export function todayIsoDay(timeZone: string, now: Date = new Date()): IsoDay {
    // `en-CA` formats a date as `YYYY-MM-DD`.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}
