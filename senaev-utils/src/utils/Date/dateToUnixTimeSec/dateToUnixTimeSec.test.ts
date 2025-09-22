import {
    describe,
    expect,
    it,
} from 'vitest';

import { dateToUnixTimeSec } from './dateToUnixTimeSec';

describe('dateToUnixTimeSec', () => {
    it('should convert Date objects to Unix time in seconds', () => {
        const testCases = [
            {
                date: new Date('2025-01-01T00:00:00.000Z'),
                expectedSec: 1735689600,
            },
            {
                date: new Date('2023-12-31T23:59:59.999Z'),
                expectedSec: 1704067199,
            },
            {
                date: new Date('1970-01-01T00:00:00.000Z'),
                expectedSec: 0,
            },
            {
                date: new Date('1970-01-01T00:00:00.500Z'),
                expectedSec: 0,
            },
            {
                date: new Date('1970-01-01T00:00:01.000Z'),
                expectedSec: 1,
            },
            {
                date: new Date('2000-01-01T00:00:00.000Z'),
                expectedSec: 946684800,
            },
            {
                date: new Date('2021-01-01T00:00:00.000Z'),
                expectedSec: 1609459200,
            },
        ];

        testCases.forEach(({ date, expectedSec }) => {
            expect(dateToUnixTimeSec(date)).toBe(expectedSec);
        });
    });

    it('should handle negative Unix timestamps (dates before 1970)', () => {
        const testCases = [
            {
                date: new Date('1969-12-31T23:59:59.000Z'),
                expectedSec: -1,
            },
            {
                date: new Date('1969-12-31T00:00:00.000Z'),
                expectedSec: -86400,
            },
            {
                date: new Date('1969-01-01T00:00:00.000Z'),
                expectedSec: -31536000,
            },
        ];

        testCases.forEach(({ date, expectedSec }) => {
            expect(dateToUnixTimeSec(date)).toBe(expectedSec);
        });
    });

    it('should handle current date correctly', () => {
        const now = new Date();
        const expectedSec = Math.floor(now.getTime() / 1000);

        expect(dateToUnixTimeSec(now)).toBe(expectedSec);
    });

    it('should be consistent with Date.getTime() and Math.floor division', () => {
        const testDates = [
            new Date('2025-01-01T00:00:00.000Z'),
            new Date('2023-12-31T23:59:59.999Z'),
            new Date('1970-01-01T00:00:00.000Z'),
            new Date('1970-01-01T00:00:00.500Z'),
            new Date('1970-01-01T00:00:01.000Z'),
            new Date('1969-12-31T23:59:59.000Z'),
        ];

        testDates.forEach((date) => {
            const result = dateToUnixTimeSec(date);
            const expected = Math.floor(date.getTime() / 1000);

            expect(result).toBe(expected);
        });
    });

    it('should handle edge cases around epoch boundaries', () => {
        const testCases = [
            {
                date: new Date('1970-01-01T00:00:00.000Z'),
                expectedSec: 0,
            },
            {
                date: new Date('1970-01-01T00:00:01.000Z'),
                expectedSec: 1,
            },
            {
                date: new Date('1970-01-01T00:00:59.000Z'),
                expectedSec: 59,
            },
            {
                date: new Date('1970-01-01T00:01:00.000Z'),
                expectedSec: 60,
            },
            {
                date: new Date('1970-01-01T01:00:00.000Z'),
                expectedSec: 3600,
            },
            {
                date: new Date('1970-01-02T00:00:00.000Z'),
                expectedSec: 86400,
            },
        ];

        testCases.forEach(({ date, expectedSec }) => {
            expect(dateToUnixTimeSec(date)).toBe(expectedSec);
        });
    });

    it('should handle large timestamps (far future)', () => {
        const testCases = [
            {
                date: new Date('2038-01-19T03:14:07.000Z'), // Max 32-bit signed integer
                expectedSec: 2147483647,
            },
            {
                date: new Date('2100-01-01T00:00:00.000Z'),
                expectedSec: 4102444800,
            },
        ];

        testCases.forEach(({ date, expectedSec }) => {
            expect(dateToUnixTimeSec(date)).toBe(expectedSec);
        });
    });

    it('should handle milliseconds precision by flooring', () => {
        const testCases = [
            {
                date: new Date('1970-01-01T00:00:00.000Z'),
                expectedSec: 0,
            },
            {
                date: new Date('1970-01-01T00:00:00.100Z'),
                expectedSec: 0,
            },
            {
                date: new Date('1970-01-01T00:00:00.500Z'),
                expectedSec: 0,
            },
            {
                date: new Date('1970-01-01T00:00:00.999Z'),
                expectedSec: 0,
            },
            {
                date: new Date('1970-01-01T00:00:01.000Z'),
                expectedSec: 1,
            },
            {
                date: new Date('1970-01-01T00:00:01.999Z'),
                expectedSec: 1,
            },
        ];

        testCases.forEach(({ date, expectedSec }) => {
            expect(dateToUnixTimeSec(date)).toBe(expectedSec);
        });
    });

    it('should handle different timezones correctly (UTC)', () => {
        // All dates should be treated as UTC internally by Date.getTime()
        const testCases = [
            {
                date: new Date('2025-01-01T00:00:00Z'),
                expectedSec: 1735689600,
            },
            {
                date: new Date('2025-01-01T00:00:00.000Z'),
                expectedSec: 1735689600,
            },
        ];

        testCases.forEach(({ date, expectedSec }) => {
            expect(dateToUnixTimeSec(date)).toBe(expectedSec);
        });
    });

    it('should return integer values only', () => {
        const testDates = [
            new Date('1970-01-01T00:00:00.500Z'),
            new Date('1970-01-01T00:00:00.999Z'),
            new Date('2025-01-01T00:00:00.123Z'),
            new Date('2023-12-31T23:59:59.999Z'),
        ];

        testDates.forEach((date) => {
            const result = dateToUnixTimeSec(date);

            expect(Number.isInteger(result)).toBe(true);
        });
    });

    it('should handle invalid dates gracefully', () => {
        const invalidDate = new Date('invalid');

        // Invalid dates return NaN for getTime(), which when divided and floored becomes 0
        expect(dateToUnixTimeSec(invalidDate)).toBe(NaN);
    });
});
