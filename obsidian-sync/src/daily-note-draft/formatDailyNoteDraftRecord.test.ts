import {
    describe, expect, it,
} from 'vitest';

import { formatDailyNoteDraftRecord, formatRecordTimestamp } from './formatDailyNoteDraftRecord';

describe('formatRecordTimestamp', () => {
    it('formats the time in Europe/Madrid with a colon', () => {
        expect(formatRecordTimestamp(new Date('2026-09-28T22:05:09Z'))).toBe('2026-09-29 00:05');
    });
});

describe('formatDailyNoteDraftRecord', () => {
    it('targets the Madrid date across midnight and preserves multiline text', () => {
        expect(formatDailyNoteDraftRecord('First\n\nSecond', new Date('2026-09-28T22:05:09Z')))
            .toBe('\n[[2026-09-29|🎙️ 2026-09-29 00:05]]: First\n\nSecond ✍️\n');
    });

    it('links the local date with a microphone and timestamp before the text', () => {
        expect(formatDailyNoteDraftRecord('Hello', new Date('2026-01-15T08:00:00Z')))
            .toBe('\n[[2026-01-15|🎙️ 2026-01-15 09:00]]: Hello ✍️\n');
    });
});
