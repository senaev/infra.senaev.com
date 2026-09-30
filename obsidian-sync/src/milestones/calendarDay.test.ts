import {
    describe, expect, it,
} from 'vitest';

import {
    addDays, formatIsoCalendarDay, parseIsoCalendarDay, todayInTimeZone,
} from './calendarDay';

describe('parseIsoCalendarDay', () => {
    it('parses a real day', () => {
        expect(parseIsoCalendarDay('2026-09-30')).toEqual({
            year: 2026,
            month: 9,
            date: 30,
        });
    });

    it('accepts 29 February only in a leap year', () => {
        expect(parseIsoCalendarDay('2028-02-29')).not.toBeNull();
        expect(parseIsoCalendarDay('2026-02-29')).toBeNull();
    });

    for (const value of [
        '2026-02-30',
        '2026-13-01',
        '2026-9-30',
        '2026-09-30T00:00',
        'today',
        '',
    ]) {
        it(`rejects ${JSON.stringify(value)}`, () => {
            expect(parseIsoCalendarDay(value)).toBeNull();
        });
    }
});

describe('addDays', () => {
    it('crosses month and year ends', () => {
        const newYearsEve = parseIsoCalendarDay('2026-12-31');

        expect(newYearsEve && formatIsoCalendarDay(addDays(newYearsEve, 1))).toBe('2027-01-01');
    });

    it('keeps years below 100 as they are', () => {
        expect(formatIsoCalendarDay(addDays({
            year: 1,
            month: 12,
            date: 31,
        }, 1))).toBe('0002-01-01');
    });
});

describe('todayInTimeZone', () => {
    it('uses the calendar day of the time zone, not of UTC', () => {
        const lateUtcEvening = new Date('2026-09-30T22:30:00Z');

        expect(formatIsoCalendarDay(todayInTimeZone('Europe/Madrid', lateUtcEvening))).toBe('2026-10-01');
        expect(formatIsoCalendarDay(todayInTimeZone('UTC', lateUtcEvening))).toBe('2026-09-30');
    });
});
