import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import ruleTestVectors from './rule-test-vectors.json';
import type { CalendarDay } from './calendarDay';
import { ruleOccursOn } from './milestoneRule';

const MOTHERS_DAY_RULE = 'FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU';
const NOVEMBER = 11;
const SUNDAY = 0;

/** Every real day of `year`, walked with a `Date` so no day is invented. */
function daysOfYear(year: number): CalendarDay[] {
	const days: CalendarDay[] = [];
	const cursor = new Date(year, 0, 1);

	while (cursor.getFullYear() === year) {
		days.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1, date: cursor.getDate() });
		cursor.setDate(cursor.getDate() + 1);
	}

	return days;
}

function isoDate({ year, month, date }: CalendarDay): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

function datesOfRuleIn(rule: string, year: number): string[] {
	return daysOfYear(year)
		.filter((day) => ruleOccursOn(rule, day))
		.map(isoDate);
}

describe('rule-test-vectors.json', () => {
	for (const vector of ruleTestVectors.vectors) {
		it(`${vector.name}, ${vector.year}`, () => {
			assert.deepEqual(datesOfRuleIn(vector.rule, vector.year), vector.dates);
		});
	}
});

describe('last Sunday of November', () => {
	it('matches exactly one day per year, a November Sunday in the last week', () => {
		for (let year = 1990; year <= 2060; year += 1) {
			const matches = daysOfYear(year).filter((day) => ruleOccursOn(MOTHERS_DAY_RULE, day));

			assert.equal(matches.length, 1, `${year} should have one match`);

			const [match] = matches;
			assert.ok(match);
			assert.equal(match.month, NOVEMBER, `${year} match must be in November`);
			assert.equal(
				new Date(match.year, match.month - 1, match.date).getDay(),
				SUNDAY,
				`${year} match must be a Sunday`,
			);
			// The last Sunday of a 30-day month can only be the 24th–30th.
			assert.ok(match.date >= 24 && match.date <= 30, `${year} match ${match.date} must be in the last week`);
		}
	});
});

describe('invalid rules', () => {
	const ANY_DAY: CalendarDay = { year: 2026, month: 1, date: 1 };

	for (const rule of [
		'',
		'sometime in November',
		'BYMONTH=1;BYMONTHDAY=1',
		'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;COUNT=3',
		'DTSTART:20200101T000000Z\nRRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1',
	]) {
		it(`never match and warn: ${JSON.stringify(rule)}`, () => {
			const warn = mock.method(console, 'warn', () => {});
			try {
				assert.equal(ruleOccursOn(rule, ANY_DAY), false);
				assert.equal(warn.mock.callCount(), 1);
			} finally {
				warn.mock.restore();
			}
		});
	}
});
