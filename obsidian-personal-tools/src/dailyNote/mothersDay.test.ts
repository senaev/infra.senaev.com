import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CalendarDay, isMothersDay } from './milestones';

const NOVEMBER = 11;
const SUNDAY = 0;

/** Every real day of `year`, walked with a `Date` so no day is invented. */
function daysOfYear(year: number): CalendarDay[] {
	const days: CalendarDay[] = [];
	const cursor = new Date(year, 0, 1);

	while (cursor.getFullYear() === year) {
		days.push({
			year: cursor.getFullYear(),
			month: cursor.getMonth() + 1,
			date: cursor.getDate(),
		});
		cursor.setDate(cursor.getDate() + 1);
	}

	return days;
}

describe("isMothersDay (last Sunday of November)", () => {
	it('matches known dates', () => {
		// Cross-checked against the calendar; these are the anchors that would
		// catch an off-by-one week or an off-by-one day.
		const lastSundays: [number, number][] = [
			[2024, 24],
			[2025, 30],
			[2026, 29],
			[2027, 28],
			[2028, 26],
		];

		for (const [year, date] of lastSundays) {
			assert.equal(
				isMothersDay({ year, month: NOVEMBER, date }),
				true,
				`${year}-11-${date} is the last Sunday of November`,
			);
		}
	});

	it('rejects the earlier Sundays of November', () => {
		// November 2026 has Sundays on the 1st, 8th, 15th, 22nd and 29th.
		for (const date of [1, 8, 15, 22]) {
			assert.equal(
				isMothersDay({ year: 2026, month: NOVEMBER, date }),
				false,
				`2026-11-${date} is not the last Sunday`,
			);
		}
	});

	it('rejects the days around the match', () => {
		for (const date of [28, 30]) {
			assert.equal(isMothersDay({ year: 2026, month: NOVEMBER, date }), false);
		}
	});

	it('matches exactly one day per year, and it is a November Sunday', () => {
		for (let year = 1990; year <= 2060; year += 1) {
			const matches = daysOfYear(year).filter(isMothersDay);

			assert.equal(matches.length, 1, `${year} should have one Mother's Day`);

			const [match] = matches;
			assert.ok(match);
			assert.equal(match.month, NOVEMBER, `${year} match must be in November`);
			assert.equal(
				new Date(match.year, match.month - 1, match.date).getDay(),
				SUNDAY,
				`${year} match must be a Sunday`,
			);
			// The last Sunday of a 30-day month can only be the 24th–30th.
			assert.ok(
				match.date >= 24 && match.date <= 30,
				`${year} match ${match.date} must be in the last week`,
			);
		}
	});

	it('never matches a month other than November', () => {
		const otherMonthMatches = daysOfYear(2026)
			.filter((day) => day.month !== NOVEMBER)
			.filter(isMothersDay);

		assert.deepEqual(otherMonthMatches, []);
	});
});
