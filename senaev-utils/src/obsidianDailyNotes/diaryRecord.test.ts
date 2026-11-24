import {
    describe, expect, it,
} from 'vitest';

import { renderDailyNote } from './dailyNoteTemplate';
import {
    DIARY_RECORD_MARKER,
    findDiaryRecordAnchor,
    formatDiaryRecord,
    formatRecordTimestamp,
    insertDiaryRecords,
} from './diaryRecord';

const PATH = 'periodic/day/2026-11-18.md';

describe('formatRecordTimestamp', () => {
    it('formats the time in Europe/Madrid with a colon', () => {
        expect(formatRecordTimestamp(new Date('2026-09-28T22:05:09Z'))).toBe('2026-09-29 00:05');
    });
});

describe('formatDiaryRecord', () => {
    it('links the day with the time of writing and keeps multiline text', () => {
        expect(formatDiaryRecord('2026-09-27', 'First\n\nSecond', new Date('2026-09-28T22:05:09Z')))
            .toBe('[[2026-09-27|🎙️ 2026-09-29 00:05]]: First\n\nSecond ✍️');
    });
});

describe('insertDiaryRecords', () => {
    it('puts records above the marker, in the order they are added', () => {
        const note = `Morning\n${DIARY_RECORD_MARKER}\nEnd\n`;
        const once = insertDiaryRecords(note, ['A ✍️'], PATH);
        const twice = insertDiaryRecords(once, ['B ✍️'], PATH);

        expect(once).toBe(`Morning\n\nA ✍️\n\n${DIARY_RECORD_MARKER}\nEnd\n`);
        expect(twice).toBe(`Morning\n\nA ✍️\n\nB ✍️\n\n${DIARY_RECORD_MARKER}\nEnd\n`);
    });

    it('accepts the marker without the emoji variation selector and with spaces around', () => {
        const note = 'Text\n\n  ⬆ Daily Note ⬆ \n';

        expect(insertDiaryRecords(note, ['A ✍️'], PATH)).toBe('Text\n\nA ✍️\n\n  ⬆ Daily Note ⬆ \n');
    });

    it('puts the records of a new daily note at the end of the diary block, above the marker', () => {
        const note = renderDailyNote('2026-11-18');
        const result = insertDiaryRecords(insertDiaryRecords(note, ['A ✍️'], PATH), ['B ✍️'], PATH);

        expect(result).toContain(`\n---\n\nA ✍️\n\nB ✍️\n\n${DIARY_RECORD_MARKER}\n\n---\n`);
        expect(result.replace('\nA ✍️\n\nB ✍️\n', '')).toBe(note);
    });

    it('works when the marker starts the note', () => {
        expect(insertDiaryRecords(DIARY_RECORD_MARKER, ['\nA ✍️\n'], PATH)).toBe(`A ✍️\n\n${DIARY_RECORD_MARKER}`);
    });

    it('fails when the note has no marker, also when only the old stream embed is there', () => {
        for (const note of [
            'Text\n',
            'Before\n---\n![[daily_note_stream]]\nAfter\n',
        ]) {
            expect(() => insertDiaryRecords(note, ['A ✍️'], PATH)).toThrow(expect.objectContaining({
                code: 'conflict',
                message: expect.stringContaining(PATH) as unknown,
            }));
        }
    });

    it('ignores markers inside code blocks and inside prose', () => {
        const note = `\`\`\`\n${DIARY_RECORD_MARKER}\n\`\`\`\nSee ${DIARY_RECORD_MARKER} here\n`;

        expect(findDiaryRecordAnchor(note)).toBeUndefined();
    });

    it('inserts several records of one call in order at one anchor', () => {
        const note = `Text\n${DIARY_RECORD_MARKER}\n`;

        expect(insertDiaryRecords(note, [
            'A ✍️',
            'B ✍️',
        ], PATH)).toBe(`Text\n\nA ✍️\n\nB ✍️\n\n${DIARY_RECORD_MARKER}\n`);
    });

    it('rejects a record that contains the marker line, so later records never split it', () => {
        const note = `Text\n${DIARY_RECORD_MARKER}\n`;

        for (const record of [
            `A\n${DIARY_RECORD_MARKER}\nB ✍️`,
            'A\n⬆ Daily Note ⬆\nB',
        ]) {
            expect(() => insertDiaryRecords(note, [
                'ok ✍️',
                record,
            ], PATH)).toThrow(expect.objectContaining({ code: 'invalid_arguments' }));
        }

        expect(insertDiaryRecords(note, [`Mention ${DIARY_RECORD_MARKER} inside a line ✍️`], PATH)).toContain('Mention');
    });

    it('does not close a fence with a line that has text after the fence', () => {
        const note = `\`\`\`text\n\`\`\`example\n${DIARY_RECORD_MARKER}\n\`\`\`\n`;

        expect(findDiaryRecordAnchor(note)).toBeUndefined();
        expect(findDiaryRecordAnchor(`${note}${DIARY_RECORD_MARKER}\n`)).toBe(note.length);
    });

    it('skips markers indented as code by four spaces or a tab', () => {
        expect(findDiaryRecordAnchor(`Text\n\n    ${DIARY_RECORD_MARKER}\n`)).toBeUndefined();
        expect(findDiaryRecordAnchor(`\t${DIARY_RECORD_MARKER}\n`)).toBeUndefined();

        const note = `    ${DIARY_RECORD_MARKER}\n${DIARY_RECORD_MARKER}\n`;

        expect(insertDiaryRecords(note, ['A ✍️'], PATH)).toBe(`    ${DIARY_RECORD_MARKER}\n\nA ✍️\n\n${DIARY_RECORD_MARKER}\n`);
    });
});
