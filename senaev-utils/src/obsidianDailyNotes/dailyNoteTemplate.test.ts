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
import { DAILY_NOTE_TEMPLATE_FIXTURES } from './dailyNoteTemplate.fixtures';

describe('renderDailyNote', () => {
    it('schedules tasks by the note date, including overlapping monthly and weekend rules', () => {
        const cases = [
            [
                '2026-10-29',
                true,
                false,
                false,
                false,
                '2026q4',
            ],
            [
                '2026-08-01',
                false,
                true,
                true,
                false,
                '2026q3',
            ],
            [
                '2026-11-01',
                false,
                true,
                false,
                true,
                '2026q4',
            ],
            [
                '2027-02-01',
                true,
                true,
                false,
                false,
                '2027q1',
            ],
            [
                '2026-12-31',
                true,
                false,
                false,
                false,
                '2026q4',
            ],
            [
                '2027-01-01',
                true,
                true,
                false,
                false,
                '2027q1',
            ],
        ] as const;

        for (const [
            day,
            weekday,
            monthly,
            saturday,
            sunday,
            quarter,
        ] of cases) {
            const text = renderDailyNote(day);

            expect(text.includes('[[Leetcode]]'), day).toBe(weekday);
            expect(text.includes('[[LinkedIn]]'), day).toBe(monthly);
            expect(text.includes('[[@senaev_speaks]]'), day).toBe(saturday);
            expect(text.includes('[[@mom]]'), day).toBe(saturday);
            expect(text.includes('[[🥞 Sunday Breakfast]]'), day).toBe(sunday);
            expect(text).toContain(`[[${quarter}#${day}]]`);
            expect(text).toContain('\n---\n![[daily_note_stream]]\n\n⬆️ Daily Note ⬆️\n\n---\n');
            expect(text).toContain('window.senaevPersonalTools.filterTasksForDaily({task, query})');
            expect(text).toContain('window.senaevPersonalTools.sortKeyForDaily({task})');
        }
    });

    it('preserves the complete output captured from the retired template and script', () => {
        for (const [
            day,
            expected,
        ] of Object.entries(DAILY_NOTE_TEMPLATE_FIXTURES)) {
            expect(renderDailyNote(day), day).toBe(expected);
        }
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
