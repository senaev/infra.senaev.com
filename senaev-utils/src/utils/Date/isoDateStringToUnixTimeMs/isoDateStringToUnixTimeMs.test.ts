import {
    describe,
    expect,
    it,
} from 'vitest';

import { isoDateStringToUnixTimeMs } from './isoDateStringToUnixTimeMs';

describe('isoDateStringToUnixTimeMs', () => {
    it('should convert ISO date string to Unix time in milliseconds', () => {
        const testCases = [
            {
                isoDate: '2025-01-01T00:00:00.000Z',
                expectedMs: 1735689600000,
            },
            {
                isoDate: '2023-12-31T23:59:59.999Z',
                expectedMs: 1704067199999,
            },
            {
                isoDate: '1970-01-01T00:00:00.000Z',
                expectedMs: 0,
            },
            {
                isoDate: '1970-01-01T00:00:00.001Z',
                expectedMs: 1,
            },
        ];

        testCases.forEach(({ isoDate, expectedMs }) => {
            expect(isoDateStringToUnixTimeMs(isoDate)).toBe(expectedMs);
        });
    });

    it('should handle current date correctly', () => {
        const now = new Date();
        const isoString = now.toISOString();
        const expectedMs = now.getTime();

        expect(isoDateStringToUnixTimeMs(isoString)).toBe(expectedMs);
    });
});
