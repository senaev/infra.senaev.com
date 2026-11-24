import {
    describe, expect, it,
} from 'vitest';

import {
    dailyDateFromPath,
    dailyNotePath,
    dailyNotePathForRootNote,
    initializeDailyNote,
    isDailyNoteDate,
    renderDailyNote,
} from './dailyNoteTemplate';

describe('renderDailyNote', () => {
    it('orders each section independently and schedules reminders on the note date', () => {
        const notes = [
            {
                path: 'wiki/Alpha.md',
                frontmatter: {
                    'morning-reminder': 'Start',
                    'morning-reminder-order': 10,
                    'evening-reminder': 'Finish',
                    'evening-reminder-order': 1,
                },
            },
            {
                path: 'wiki/Beta.md',
                frontmatter: {
                    'morning-reminder': 'Prepare',
                    'morning-reminder-order': 2,
                    'evening-reminder': 'Review',
                    'evening-reminder-order': 2,
                },
            },
            {
                path: 'wiki/Gamma.md',
                frontmatter: {
                    'day-reminder': 'Weekly',
                    'day-reminder-schedule': 'FREQ=WEEKLY;BYDAY=SA',
                },
            },
            {
                path: 'wiki/Delta.md',
                frontmatter: { 'day-reminder': 'Daily' },
            },
        ];
        const saturday = renderDailyNote('2026-08-01', { notes });

        expect(saturday).toContain('[[Beta|Prepare]]\n- [ ] [[Alpha|Start]]');
        expect(saturday).toContain('[[Alpha|Finish]]\n- [ ] [[Beta|Review]]');
        expect(saturday).toContain('[[Delta|Daily]]\n- [ ] [[Gamma|Weekly]]');
        expect(renderDailyNote('2026-08-02', { notes })).not.toContain('Weekly');
        // The Tasks plugin gives each checkbox line to these expressions as `task`.
        expect(saturday).toContain([
            'filter by function window.senaevPersonalTools.filterRemindersForDaily({task, query})',
            'sort by function window.senaevPersonalTools.sortKeyForDaily({task})',
        ].join('\n'));
        expect(saturday).toContain('⬆️ Daily Note ⬆️');
    });

    it('uses short links and keeps paths when another note has the same name', () => {
        const notes = [
            {
                path: 'habits/Cold shower.md',
                frontmatter: { 'morning-reminder': 'Cold shower' },
            },
            {
                path: 'work/Calendar.md',
                frontmatter: { 'day-reminder': 'Check the calendar' },
            },
            {
                path: 'Journal.md',
                frontmatter: { 'evening-reminder': 'Journal' },
            },
        ];
        const notePaths = [
            ...notes.map(({ path }) => path),
            'archive/calendar.md',
            'archive/Journal.md',
        ];
        const daily = renderDailyNote('2026-08-01', {
            notes,
            notePaths,
        });

        expect(daily).toContain('- [ ] [[Cold shower]]\n');
        expect(daily).toContain('- [ ] [[work/Calendar|Check the calendar]]\n');
        expect(daily).toContain('- [ ] [[../../Journal|Journal]]\n');
    });

    it('rejects days that do not exist', () => {
        for (const value of [
            '2024-02-29',
            '2000-02-29',
            '2026-03-29',
            '2026-10-25',
        ]) {
            expect(isDailyNoteDate(value), value).toBe(true);
        }

        for (const value of [
            '2026-02-29',
            '1900-02-29',
            '2026-04-31',
            '2026-00-01',
            '2026-13-01',
            '2026-10-00',
            '2026-1-01',
        ]) {
            expect(isDailyNoteDate(value), value).toBe(false);
            expect(() => renderDailyNote(value)).toThrow('Invalid daily note date');
            expect(() => dailyNotePath(value)).toThrow('Invalid daily note date');
        }
    });
});

describe('daily note paths', () => {
    it('maps a day to its note in the daily folder', () => {
        expect(dailyNotePath('2026-11-08')).toBe('periodic/day/2026-11-08.md');
    });

    it('accepts only direct daily-folder children with real dates', () => {
        expect(dailyDateFromPath('periodic/day/2026-10-29.md')).toBe('2026-10-29');

        for (const path of [
            '2026-10-29.md',
            'other/2026-10-29.md',
            'periodic/day/nested/2026-10-29.md',
            'periodic/day/2026-02-30.md',
            'periodic/day/2026-10-29.txt',
        ]) {
            expect(dailyDateFromPath(path), path).toBeNull();
            expect(initializeDailyNote(path, '')).toBe('');
        }
    });

    it('maps only date-named vault-root notes to the daily folder', () => {
        expect(dailyNotePathForRootNote('2026-11-08.md')).toBe('periodic/day/2026-11-08.md');

        for (const path of [
            'periodic/day/2026-11-08.md',
            'other/2026-11-08.md',
            '2026-02-30.md',
            '2026-11-08 2.md',
            '2026-11-08.txt',
            'note.md',
        ]) {
            expect(dailyNotePathForRootNote(path), path).toBeNull();
        }
    });
});

describe('initializeDailyNote', () => {
    const path = 'periodic/day/2026-10-29.md';
    const generated = renderDailyNote('2026-10-29');

    it('fills blank notes', () => {
        for (const input of [
            '',
            '\n  ',
        ]) {
            expect(initializeDailyNote(path, input)).toBe(generated);
        }
    });

    it('never replaces existing content', () => {
        for (const input of [
            generated,
            generated.replace('- [ ]', '- [x]'),
            'My diary text',
            '<!-- senaev:daily-note-template -->',
        ]) {
            expect(initializeDailyNote(path, input)).toBe(input);
        }
    });

    it('keeps frontmatter and fills the body under it', () => {
        const yaml = '---\ntags: [daily]\n---\n';

        expect(initializeDailyNote(path, '---\n---\n')).toBe(`---\n---\n\n${generated}`);
        expect(initializeDailyNote(path, yaml)).toBe(`${yaml}\n${generated}`);
        expect(initializeDailyNote(path, `${yaml}Existing entry`)).toBe(`${yaml}Existing entry`);
    });
});
