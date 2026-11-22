import { RRule } from 'rrule';
import type { CalendarDay } from './calendarDay';

/**
 * Whether a calculated milestone date, such as "last Sunday of November",
 * falls on `day`.
 *
 * `rule` is an RRULE value as defined by RFC 5545 (iCalendar), section 3.3.10:
 * https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10 — for example
 * `FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU`. The standard was chosen over a custom
 * syntax because the rules live in `milestones.json` and note frontmatter,
 * which external code reads too, and every language has an RRULE library.
 *
 * The rule is evaluated as if `DTSTART` were 1 January of `day`'s year at
 * 00:00 UTC. A rule that depends on its own `DTSTART` or uses `COUNT` would
 * mean something different under that convention, so both are rejected. The
 * convention is shared with other consumers through
 * `rule-test-vectors.json` next to this file.
 *
 * An invalid rule never matches, and is reported on the console.
 */
export function ruleOccursOn(rule: string, day: CalendarDay): boolean {
	const recurrence = parseRule(rule, day.year);
	if (!recurrence) {
		return false;
	}

	const dayStart = new Date(Date.UTC(day.year, day.month - 1, day.date));
	return recurrence.between(dayStart, dayStart, true).length > 0;
}

function parseRule(rule: string, year: number): RRule | null {
	try {
		const options = RRule.parseString(rule);
		if (options.freq === undefined || options.dtstart || options.count) {
			throw new Error('FREQ is required, DTSTART and COUNT are not supported');
		}

		return new RRule({ ...options, dtstart: new Date(Date.UTC(year, 0, 1)) });
	} catch (error) {
		console.warn(`Invalid milestone rule "${rule}":`, error);
		return null;
	}
}
