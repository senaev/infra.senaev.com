import {
    describe, expect, test,
} from 'vitest';

import {
    compareReminders, type DailyReminder, isActiveDailyDate, isReminderInDailyNote, isReminderPathExcluded,
} from './dailyReminderList';

const TODAY = '2026-10-17';

const ACTIVE = {
    noteDate: TODAY,
    isActiveNote: true,
};

const REMINDER: DailyReminder = {
    path: 'notes/a.md',
    status: 'open',
    priority: 'normal',
    date: null,
    closedDate: null,
};

describe('isActiveDailyDate', () => {
    test('today and the future are active, the past is not', () => {
        expect(isActiveDailyDate({
            noteDate: TODAY,
            today: TODAY,
        })).toBe(true);
        expect(isActiveDailyDate({
            noteDate: '2026-10-18',
            today: TODAY,
        })).toBe(true);
        expect(isActiveDailyDate({
            noteDate: '2026-10-16',
            today: TODAY,
        })).toBe(false);
    });

    test('a note whose name is not a date is active', () => {
        expect(isActiveDailyDate({
            noteDate: 'Daily note template',
            today: TODAY,
        })).toBe(true);
    });
});

describe('isReminderInDailyNote', () => {
    test('lists past and current open reminders, not future ones', () => {
        expect(isReminderInDailyNote({
            ...REMINDER,
            date: '2026-10-01',
        }, ACTIVE)).toBe(true);
        expect(isReminderInDailyNote({
            ...REMINDER,
            date: TODAY,
        }, ACTIVE)).toBe(true);
        expect(isReminderInDailyNote({
            ...REMINDER,
            date: '2026-10-18',
        }, ACTIVE)).toBe(false);
    });

    test('lists undated open reminders unless their priority is low or lowest', () => {
        expect(isReminderInDailyNote(REMINDER, ACTIVE)).toBe(true);
        expect(isReminderInDailyNote({
            ...REMINDER,
            priority: 'low',
        }, ACTIVE)).toBe(false);
        expect(isReminderInDailyNote({
            ...REMINDER,
            priority: 'lowest',
        }, ACTIVE)).toBe(false);
    });

    test('an inactive note lists only the reminders closed on its day', () => {
        const past = {
            noteDate: '2026-10-10',
            isActiveNote: false,
        };

        expect(isReminderInDailyNote({
            ...REMINDER,
            date: '2026-10-01',
        }, past)).toBe(false);
        expect(isReminderInDailyNote({
            ...REMINDER,
            status: 'done',
            closedDate: '2026-10-10',
        }, past)).toBe(true);
        expect(isReminderInDailyNote({
            ...REMINDER,
            status: 'cancelled',
            closedDate: '2026-10-11',
        }, past)).toBe(false);
    });

    test('never lists reminders of periodic notes', () => {
        expect(isReminderInDailyNote({
            ...REMINDER,
            path: 'periodic/day/2026-10-17.md',
        }, ACTIVE)).toBe(false);
    });
});

describe('compareReminders', () => {
    test('sorts by priority, then path, then line', () => {
        const reminders = [
            {
                priority: 'normal' as const,
                path: 'b/x.md',
                line: 2,
            },
            {
                priority: 'normal' as const,
                path: 'a/z.md',
                line: 10,
            },
            {
                priority: 'normal' as const,
                path: 'a/z.md',
                line: 9,
            },
            {
                priority: 'high' as const,
                path: 'z.md',
                line: 1,
            },
        ];

        expect(reminders.sort(compareReminders).map(({ path, line }) => `${path}:${line}`)).toEqual([
            'z.md:1',
            'a/z.md:9',
            'a/z.md:10',
            'b/x.md:2',
        ]);
    });
});

describe('isReminderPathExcluded', () => {
    test('excludes dot-folders and the excluded root folders', () => {
        expect(isReminderPathExcluded('.obsidian/x.md')).toBe(true);
        expect(isReminderPathExcluded('notes/.trash/x.md')).toBe(true);
        expect(isReminderPathExcluded('_templates/Daily note template.md')).toBe(true);
        expect(isReminderPathExcluded('plugins/senaev-personal-tools/README.md')).toBe(true);
        expect(isReminderPathExcluded('notes/_templates/x.md')).toBe(false);
        expect(isReminderPathExcluded('@senaev/reminders/reminders_stream.md')).toBe(false);
    });
});
