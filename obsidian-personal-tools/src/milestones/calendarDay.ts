/** A day of the calendar, with `month` 1-based so it reads like a date. */
export interface CalendarDay {
	year: number;
	month: number;
	date: number;
}

/** The calendar day of a local-time `Date`. */
export function toCalendarDay(date: Date): CalendarDay {
	return { year: date.getFullYear(), month: date.getMonth() + 1, date: date.getDate() };
}
