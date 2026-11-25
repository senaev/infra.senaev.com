import { type IsoDay, isIsoDay } from '../obsidianReminders/isoDay';

/**
 * One occurrence on a calendar day: a reminder linking to a note, a daily note mentioning it, …
 * `kind` says what it is (e.g. `open`, `done`); the model never looks inside it.
 */
export type CalendarEntry<Kind extends string> = {
    day: IsoDay;
    kind: Kind;
};

export type KindCounts<Kind extends string> = Record<Kind, number>;

export type CalendarDay<Kind extends string> = {
    day: IsoDay;
    /** The kind that wins the cell colour: the first of the model's kinds present on the day. */
    kind: Kind;
    counts: KindCounts<Kind>;
};

export type CalendarYear<Kind extends string> = {
    /** `YYYY` */
    year: string;
    counts: KindCounts<Kind>;
    days: ReadonlyMap<IsoDay, CalendarDay<Kind>>;
};

export type CalendarModel<Kind extends string> = {
    /** Kinds in display order, which is also their priority for the colour of a day. */
    kinds: readonly Kind[];
    counts: KindCounts<Kind>;
    /** Every year from the first to the last one with an entry, oldest first, gaps included. */
    years: readonly CalendarYear<Kind>[];
};

function emptyCounts<Kind extends string>(kinds: readonly Kind[]): KindCounts<Kind> {
    return Object.fromEntries(kinds.map((kind) => [
        kind,
        0,
    ])) as KindCounts<Kind>;
}

/**
 * Groups entries by day and year. An entry whose day is not a real `YYYY-MM-DD` or whose kind is
 * not listed in `kinds` is ignored, so a stray value can neither create a bogus year nor a cell.
 * `kinds` is ordered by priority: a day with an open and a done reminder is drawn as open.
 */
export function buildCalendarModel<Kind extends string>(
    kinds: readonly Kind[],
    entries: readonly CalendarEntry<Kind>[]
): CalendarModel<Kind> {
    const counts = emptyCounts(kinds);
    const byYear = new Map<number, { counts: KindCounts<Kind>; days: Map<IsoDay, CalendarDay<Kind>> }>();

    for (const { day, kind } of entries) {
        if (!isIsoDay(day) || !kinds.includes(kind)) {
            continue;
        }

        const year = Number(day.slice(0, 4));
        const yearData = byYear.get(year) ?? {
            counts: emptyCounts(kinds),
            days: new Map(),
        };

        byYear.set(year, yearData);

        const dayData = yearData.days.get(day) ?? {
            day,
            kind,
            counts: emptyCounts(kinds),
        };

        yearData.days.set(day, dayData);

        dayData.counts[kind]++;
        yearData.counts[kind]++;
        counts[kind]++;

        if (kinds.indexOf(kind) < kinds.indexOf(dayData.kind)) {
            dayData.kind = kind;
        }
    }

    const years: CalendarYear<Kind>[] = [];

    if (byYear.size > 0) {
        const numbers = [...byYear.keys()];

        for (let year = Math.min(...numbers); year <= Math.max(...numbers); year++) {
            const yearData = byYear.get(year);

            years.push({
                year: String(year).padStart(4, '0'),
                counts: yearData?.counts ?? emptyCounts(kinds),
                days: yearData?.days ?? new Map(),
            });
        }
    }

    return {
        kinds,
        counts,
        years,
    };
}
