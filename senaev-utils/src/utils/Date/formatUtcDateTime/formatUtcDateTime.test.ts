import {
    describe,
    expect,
    test,
} from 'vitest';

import { formatUtcDateTime } from './formatUtcDateTime';

describe('formatUtcDateTime', () => {
    const date = new Date('2026-03-09T07:05:04.000Z');

    test('formats as DD-MM-YYYY HH:mm by default', () => {
        expect(formatUtcDateTime(date)).toBe('09-03-2026 07:05');
    });

    test('appends seconds when asked', () => {
        expect(formatUtcDateTime(date, { withSeconds: true })).toBe('09-03-2026 07:05:04');
    });

    test('pads day, month, hour and minute to two digits', () => {
        expect(formatUtcDateTime(new Date('2026-01-02T03:04:05.000Z')))
            .toBe('02-01-2026 03:04');
    });

    test('uses UTC rather than the local timezone', () => {
        // 23:30 UTC stays on the 31st regardless of where this runs.
        expect(formatUtcDateTime(new Date('2025-12-31T23:30:00.000Z')))
            .toBe('31-12-2025 23:30');
    });

    test('accepts a date built from epoch milliseconds', () => {
        expect(formatUtcDateTime(new Date(0))).toBe('01-01-1970 00:00');
    });
});
