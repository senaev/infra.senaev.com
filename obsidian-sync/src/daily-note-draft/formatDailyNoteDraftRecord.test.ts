import {
    describe, expect, it,
} from 'vitest';

import { formatDailyNoteDraftRecord, formatRecordTimestamp } from './formatDailyNoteDraftRecord';

describe('formatRecordTimestamp', () => {
    it('formats the time in Europe/Madrid with hyphens', () => {
        expect(formatRecordTimestamp(new Date('2026-09-28T22:05:09Z'))).toBe('2026-09-29 00-05-09');
    });
});

describe('formatDailyNoteDraftRecord', () => {
    it('puts a timestamp before the text and the emoji after it', () => {
        expect(formatDailyNoteDraftRecord('Hello', new Date('2026-01-15T08:00:00Z')))
            .toBe('\n2026-01-15 09-00-00\n\nHello ✍️\n');
    });
});
