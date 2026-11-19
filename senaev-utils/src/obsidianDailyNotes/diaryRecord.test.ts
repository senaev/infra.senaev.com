import {
    describe, expect, it,
} from 'vitest';

import { renderDailyNote } from './dailyNoteTemplate';
import {
    DIARY_RECORD_MARKER,
    findDiaryRecordAnchor,
    formatDiaryRecord,
    formatRecordTimestamp,
    insertDiaryRecord,
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

describe('insertDiaryRecord', () => {
    it('puts records above the marker, in the order they are added', () => {
        const note = `Morning\n${DIARY_RECORD_MARKER}\n![[daily_note_stream]]\nEnd\n`;
        const once = insertDiaryRecord(note, 'A ✍️', PATH);
        const twice = insertDiaryRecord(once, 'B ✍️', PATH);

        expect(once).toBe(`Morning\n\nA ✍️\n\n${DIARY_RECORD_MARKER}\n![[daily_note_stream]]\nEnd\n`);
        expect(twice).toBe(`Morning\n\nA ✍️\n\nB ✍️\n\n${DIARY_RECORD_MARKER}\n![[daily_note_stream]]\nEnd\n`);
    });

    it('accepts the marker without the emoji variation selector and with spaces around', () => {
        const note = 'Text\n\n  ⬆ Daily Note ⬆ \n';

        expect(insertDiaryRecord(note, 'A ✍️', PATH)).toBe('Text\n\nA ✍️\n\n  ⬆ Daily Note ⬆ \n');
    });

    it('falls back to the line of the stream embed', () => {
        const note = renderDailyNote('2026-11-18');
        const result = insertDiaryRecord(insertDiaryRecord(note, 'A ✍️', PATH), 'B ✍️', PATH);

        expect(result).toContain('\n---\n\nA ✍️\n\nB ✍️\n\n![[daily_note_stream]]\n');
        expect(result.replace('\nA ✍️\n\nB ✍️\n', '')).toBe(note.replace('\n---\n![[daily_note_stream]]', '\n---\n\n![[daily_note_stream]]'));
    });

    it('works at the start of a note and when the line before has no newline gap', () => {
        expect(insertDiaryRecord('![[daily_note_stream]]', '\nA ✍️\n', PATH)).toBe('A ✍️\n\n![[daily_note_stream]]');
    });

    it('ignores anchors inside code blocks and inside prose', () => {
        const note = `\`\`\`\n${DIARY_RECORD_MARKER}\n\`\`\`\nSee ![[daily_note_stream]] here\n`;

        expect(findDiaryRecordAnchor(note)).toBeUndefined();
        expect(() => insertDiaryRecord(note, 'A ✍️', PATH)).toThrow(expect.objectContaining({
            code: 'conflict',
            message: expect.stringContaining(PATH) as unknown,
        }));
    });

    it('prefers the marker even when the embed comes first', () => {
        const note = `![[daily_note_stream]]\n${DIARY_RECORD_MARKER}\n`;

        expect(insertDiaryRecord(note, 'A ✍️', PATH)).toBe(`![[daily_note_stream]]\n\nA ✍️\n\n${DIARY_RECORD_MARKER}\n`);
    });
});
