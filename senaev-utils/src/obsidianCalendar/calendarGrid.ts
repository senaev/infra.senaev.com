import { type IsoDay } from '../obsidianReminders/isoDay';

export type CalendarMonthGrid = {
    /** 1 to 12 */
    month: number;
    /**
     * Columns, left to right. Each has 7 rows from the first day of the week down; a slot outside
     * the month is `null`, so every column has the same height.
     */
    weeks: readonly (readonly (IsoDay | null)[])[];
    /**
     * Whether the previous month ends on the last row of its last column, e.g. on a Sunday when
     * weeks start on Monday. This month starts in the next column then, so the two would touch
     * with nothing between them; a calendar leaves one empty column. Always `false` for January.
     */
    separated: boolean;
};

/** 0 is Sunday, 1 is Monday: the day a calendar week starts on. */
export type WeekStart = 0 | 1;

function pad(value: number, length: number): string {
    return String(value).padStart(length, '0');
}

/** The 12 months of `year` laid out as columns of weeks, ready to draw as a grid. */
export function buildYearGrid(year: number, weekStart: WeekStart = 1): CalendarMonthGrid[] {
    const months: CalendarMonthGrid[] = [];

    for (let month = 1; month <= 12; month++) {
        // `setUTCFullYear` keeps years 0 to 99 as they are, `Date.UTC` maps them onto 1900 to 1999.
        const first = new Date(0);

        first.setUTCFullYear(year, month - 1, 1);
        const last = new Date(0);

        last.setUTCFullYear(year, month, 0);

        const slots: (IsoDay | null)[] = Array.from(
            { length: (first.getUTCDay() - weekStart + 7) % 7 },
            () => null
        );

        for (let dayOfMonth = 1; dayOfMonth <= last.getUTCDate(); dayOfMonth++) {
            slots.push(`${pad(year, 4)}-${pad(month, 2)}-${pad(dayOfMonth, 2)}`);
        }

        while (slots.length % 7 !== 0) {
            slots.push(null);
        }

        const weeks: (IsoDay | null)[][] = [];

        for (let index = 0; index < slots.length; index += 7) {
            weeks.push(slots.slice(index, index + 7));
        }

        const previousLastWeek = months[months.length - 1]?.weeks.at(-1);

        months.push({
            month,
            weeks,
            separated: previousLastWeek !== undefined && previousLastWeek[6] !== null,
        });
    }

    return months;
}
