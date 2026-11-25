import {
    describe, expect, it,
} from 'vitest';

import { buildYearGrid } from './calendarGrid';
import { buildCalendarModel } from './calendarModel';
import {
    buildMentionCalendar,
    buildReminderCalendar,
    linksToNote,
    reminderCalendarEntries,
    wikiLinkPaths,
    type ResolveLink,
} from './noteCalendar';

/** A vault with two notes named Calendar, as Obsidian would resolve links in it. */
const VAULT_LINKS: Record<string, string> = {
    Gym: 'health/Gym.md',
    'health/Gym': 'health/Gym.md',
    Other: 'Other.md',
    'work/Calendar': 'work/Calendar.md',
    '../../Journal': 'Journal.md',
};

const resolveLink: ResolveLink = (linkpath) => VAULT_LINKS[linkpath] ?? null;

const GYM = {
    name: 'Gym',
    path: 'health/Gym.md',
};

describe('wikiLinkPaths', () => {
    it('takes the path before a heading or an alias', () => {
        expect(wikiLinkPaths('[[Gym]] [[work/Calendar#Week 1|Plan]] [[Journal|J]] [[#here]]')).toEqual([
            'Gym',
            'work/Calendar',
            'Journal',
        ]);
    });
});

describe('linksToNote', () => {
    it('matches a plain, heading, aliased and path-qualified link to the note', () => {
        expect(linksToNote('Do [[Gym]] now', 'periodic/day/2026-11-25.md', GYM, resolveLink)).toBe(true);
        expect(linksToNote('[[Gym#2026-11-25|Gym]]', 'periodic/day/2026-11-25.md', GYM, resolveLink)).toBe(true);
        expect(linksToNote('[[Gym|Training]]', 'periodic/day/2026-11-25.md', GYM, resolveLink)).toBe(true);
        expect(linksToNote('[[health/Gym|Training]]', 'periodic/day/2026-11-25.md', GYM, resolveLink)).toBe(true);
    });

    it('resolves a path-qualified link of the template, not just its name', () => {
        const calendar = {
            name: 'Calendar',
            path: 'work/Calendar.md',
        };
        const journal = {
            name: 'Journal',
            path: 'Journal.md',
        };

        expect(linksToNote('[[work/Calendar|Check the calendar]]', 'periodic/day/a.md', calendar, resolveLink)).toBe(true);
        expect(linksToNote('[[../../Journal|Journal]]', 'periodic/day/a.md', journal, resolveLink)).toBe(true);
    });

    it('does not match another note with the same name, another note or unlinked text', () => {
        const otherCalendar = {
            name: 'Calendar',
            path: 'home/Calendar.md',
        };

        expect(linksToNote('[[work/Calendar]]', 'periodic/day/a.md', otherCalendar, resolveLink)).toBe(false);
        expect(linksToNote('[[Other]] Gym', 'periodic/day/a.md', GYM, resolveLink)).toBe(false);
        expect(linksToNote('Gym without a link', 'periodic/day/a.md', GYM, resolveLink)).toBe(false);
    });
});

describe('reminderCalendarEntries', () => {
    it('keeps only reminders of real daily notes that link to the note', () => {
        const entries = reminderCalendarEntries(
            [
                {
                    path: 'periodic/day/2026-11-25.md',
                    description: '[[Gym]]',
                    status: 'done',
                },
                {
                    path: 'periodic/day/2026-11-25 2.md',
                    description: '[[Gym]]',
                    status: 'done',
                },
                {
                    path: 'periodic/day/2026-02-30.md',
                    description: '[[Gym]]',
                    status: 'done',
                },
                {
                    path: 'periodic/quarter/2025q1.md',
                    description: '[[Gym]]',
                    status: 'open',
                },
                {
                    path: 'tasks_stream.md',
                    description: '[[Gym]]',
                    status: 'open',
                },
                {
                    path: 'periodic/day/2026-11-24.md',
                    description: '[[Other]]',
                    status: 'open',
                },
            ],
            GYM,
            resolveLink
        );

        expect(entries).toEqual([
            {
                day: '2026-11-25',
                kind: 'done',
            },
        ]);
    });
});

describe('buildCalendarModel', () => {
    it('counts per kind, per year and per day, and lets the first kind win the day', () => {
        const model = buildReminderCalendar(
            [
                {
                    path: 'periodic/day/2024-05-01.md',
                    description: '[[A]]',
                    status: 'done',
                },
                {
                    path: 'periodic/day/2026-01-02.md',
                    description: '[[A]]',
                    status: 'done',
                },
                {
                    path: 'periodic/day/2026-01-02.md',
                    description: '[[A#x|A]]',
                    status: 'open',
                },
                {
                    path: 'periodic/day/2026-01-03.md',
                    description: '[[A]]',
                    status: 'cancelled',
                },
            ],
            {
                name: 'A',
                path: 'A.md',
            },
            () => 'A.md'
        );

        expect(model.counts).toEqual({
            open: 1,
            cancelled: 1,
            done: 2,
        });
        expect(model.years.map((year) => year.year)).toEqual([
            '2024',
            '2025',
            '2026',
        ]);
        expect(model.years[1]?.counts).toEqual({
            open: 0,
            cancelled: 0,
            done: 0,
        });
        expect(model.years[2]?.counts).toEqual({
            open: 1,
            cancelled: 1,
            done: 1,
        });

        const busyDay = model.years[2]?.days.get('2026-01-02');

        expect(busyDay?.kind).toBe('open');
        expect(busyDay?.counts).toEqual({
            open: 1,
            cancelled: 0,
            done: 1,
        });
    });

    it('is empty without entries and ignores invalid days and unknown kinds', () => {
        expect(buildCalendarModel(['a'], []).years).toEqual([]);

        const model = buildCalendarModel(['a'], [
            {
                day: 'tasks_stream.md',
                kind: 'a',
            },
            {
                day: '2026-11-25',
                kind: 'b' as 'a',
            },
        ]);

        expect(model.years).toEqual([]);
        expect(model.counts).toEqual({ a: 0 });
    });
});

describe('buildMentionCalendar', () => {
    it('lists the daily notes that link to the note, and no other source', () => {
        const model = buildMentionCalendar(
            {
                'periodic/day/2026-11-24.md': {
                    'Gym.md': 2,
                    'Other.md': 1,
                },
                'periodic/day/2026-11-25.md': { 'Other.md': 1 },
                'periodic/week/2026w48.md': { 'Gym.md': 1 },
                'periodic/day/2026-11-26 2.md': { 'Gym.md': 1 },
            },
            'Gym.md'
        );

        expect(model.counts).toEqual({ mention: 1 });
        expect([...(model.years[0]?.days.keys() ?? [])]).toEqual(['2026-11-24']);
    });
});

describe('buildYearGrid', () => {
    it('lays months out as Monday-first columns of 7 with null padding', () => {
        const months = buildYearGrid(2026);
        const november = months[10];

        // 2026-11-01 is a Sunday: six empty slots, then the 1st, in the first column.
        expect(november?.weeks[0]).toEqual([
            null,
            null,
            null,
            null,
            null,
            null,
            '2026-11-01',
        ]);
        expect(november?.weeks.every((week) => week.length === 7)).toBe(true);
        expect(november?.weeks.flat().filter((day) => day !== null)).toHaveLength(30);
    });

    it('starts the week on Sunday on request and handles leap years', () => {
        const february = buildYearGrid(2024, 0)[1];

        // 2024-02-01 is a Thursday.
        expect(february?.weeks[0]?.indexOf('2024-02-01')).toBe(4);
        expect(february?.weeks.flat().filter((day) => day !== null)).toHaveLength(29);
    });
});
