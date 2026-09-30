import {
    describe, expect, it,
} from 'vitest';

import {
    addDays, type CalendarDay, formatIsoCalendarDay,
} from './calendarDay';
import { readFixture } from './fixtures/readFixture';
import { ruleOccursOn } from './ruleOccursOn';

interface RuleTestVector {
    name: string;
    rule: string;
    year: number;
    dates: string[];
}

const { vectors } = readFixture('rule-test-vectors.json') as { vectors: RuleTestVector[] };

function daysOfYear(year: number): CalendarDay[] {
    const days: CalendarDay[] = [];

    for (let day: CalendarDay = {
        year,
        month: 1,
        date: 1,
    }; day.year === year; day = addDays(day, 1)) {
        days.push(day);
    }

    return days;
}

function datesOfRuleIn(rule: string, year: number): string[] {
    return daysOfYear(year)
        .filter((day) => ruleOccursOn(rule, day))
        .map(formatIsoCalendarDay);
}

describe('rule-test-vectors.json', () => {
    it('has vectors', () => {
        expect(vectors.length).toBeGreaterThan(0);
    });

    for (const vector of vectors) {
        it(`${vector.name}, ${vector.year}`, () => {
            expect(datesOfRuleIn(vector.rule, vector.year)).toEqual(vector.dates);
        });
    }
});

describe('last Sunday of November', () => {
    it('matches exactly one November Sunday in the last week, 1990-2060', () => {
        for (let year = 1990; year <= 2060; year += 1) {
            const matches = daysOfYear(year).filter((day) => ruleOccursOn('FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU', day));

            expect(matches).toHaveLength(1);

            const [match] = matches;

            expect(match?.month).toBe(11);
            expect(new Date(Date.UTC(year, 10, match?.date)).getUTCDay()).toBe(0);
            expect(match?.date).toBeGreaterThanOrEqual(24);
        }
    });
});

describe('invalid rules', () => {
    const ANY_DAY: CalendarDay = {
        year: 2026,
        month: 1,
        date: 1,
    };

    for (const rule of [
        '',
        'sometime in November',
        'BYMONTH=1;BYMONTHDAY=1',
        'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;COUNT=3',
        'DTSTART:20200101T000000Z\nRRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1',
    ]) {
        it(`throws: ${JSON.stringify(rule)}`, () => {
            expect(() => ruleOccursOn(rule, ANY_DAY)).toThrow();
        });
    }
});
