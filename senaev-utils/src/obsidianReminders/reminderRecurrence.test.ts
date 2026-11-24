import {
    describe, expect, test,
} from 'vitest';

import { getNextRecurrenceDueDate, validateRecurrence } from './reminderRecurrence';

describe('validateRecurrence', () => {
    test.each([
        'every month',
        'every 3 months',
        'every 90 days when done',
        'every week on Monday, Friday',
        'every weekday',
    ])('accepts "%s"', (text) => {
        expect(validateRecurrence(text)).toBeNull();
    });

    test.each([
        'sometimes',
        'every',
        'every month!?',
        '',
    ])('refuses "%s"', (text) => {
        expect(validateRecurrence(text)).not.toBeNull();
    });
});

describe('getNextRecurrenceDueDate', () => {
    test('counts from the date, also when the reminder is completed late', () => {
        expect(getNextRecurrenceDueDate({
            recurrence: 'every 3 months',
            date: '2026-05-01',
            completedOn: '2026-06-25',
        })).toBe('2026-08-01');
    });

    test('counts from the completion day with "when done"', () => {
        expect(getNextRecurrenceDueDate({
            recurrence: 'every 90 days when done',
            date: '2026-11-09',
            completedOn: '2026-11-20',
        })).toBe('2027-02-18');
    });

    test('keeps a future date as the base', () => {
        expect(getNextRecurrenceDueDate({
            recurrence: 'every week',
            date: '2026-12-01',
            completedOn: '2026-11-01',
        })).toBe('2026-12-08');
    });

    test('goes to the end of a shorter month instead of skipping it', () => {
        expect(getNextRecurrenceDueDate({
            recurrence: 'every month',
            date: '2026-01-31',
            completedOn: '2026-01-31',
        })).toBe('2026-02-28');
        expect(getNextRecurrenceDueDate({
            recurrence: 'every year',
            date: '2028-02-29',
            completedOn: '2028-02-29',
        })).toBe('2029-02-28');
    });

    test('follows weekdays', () => {
        // 2026-10-16 is a Friday.
        expect(getNextRecurrenceDueDate({
            recurrence: 'every weekday',
            date: '2026-10-16',
            completedOn: '2026-10-16',
        })).toBe('2026-10-19');
    });
});
