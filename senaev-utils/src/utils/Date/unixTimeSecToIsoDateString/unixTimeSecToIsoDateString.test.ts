import {
    describe,
    expect,
    it,
} from 'vitest';

import { unixTimeSecToIsoDateString } from './unixTimeSecToIsoDateString';

describe('unixTimeSecToIsoDateString', () => {
    it('should convert Unix time in seconds to ISO date string', () => {
        const testCases = [
            {
                unixTimeSec: 1735689600,
                expectedIsoDate: '2025-01-01T00:00:00.000Z',
            },
            {
                unixTimeSec: 1704067199,
                expectedIsoDate: '2023-12-31T23:59:59.000Z',
            },
            {
                unixTimeSec: 0,
                expectedIsoDate: '1970-01-01T00:00:00.000Z',
            },
            {
                unixTimeSec: 1,
                expectedIsoDate: '1970-01-01T00:00:01.000Z',
            },
            {
                unixTimeSec: 946684800,
                expectedIsoDate: '2000-01-01T00:00:00.000Z',
            },
            {
                unixTimeSec: 1609459200,
                expectedIsoDate: '2021-01-01T00:00:00.000Z',
            },
        ];

        testCases.forEach(({ unixTimeSec, expectedIsoDate }) => {
            expect(unixTimeSecToIsoDateString(unixTimeSec)).toBe(expectedIsoDate);
        });
    });

    it('should handle negative Unix timestamps (before 1970)', () => {
        const testCases = [
            {
                unixTimeSec: -1,
                expectedIsoDate: '1969-12-31T23:59:59.000Z',
            },
            {
                unixTimeSec: -86400,
                expectedIsoDate: '1969-12-31T00:00:00.000Z',
            },
            {
                unixTimeSec: -31536000,
                expectedIsoDate: '1969-01-01T00:00:00.000Z',
            },
        ];

        testCases.forEach(({ unixTimeSec, expectedIsoDate }) => {
            expect(unixTimeSecToIsoDateString(unixTimeSec)).toBe(expectedIsoDate);
        });
    });

    it('should handle current date correctly', () => {
        const now = new Date();
        const unixTimeSec = Math.floor(now.getTime() / 1000);
        const expectedIsoDate = new Date(unixTimeSec * 1000).toISOString();

        expect(unixTimeSecToIsoDateString(unixTimeSec)).toBe(expectedIsoDate);
    });

    it('should be consistent with Date constructor and toISOString', () => {
        const testUnixTimes = [
            1735689600,
            1704067199,
            0,
            1,
            946684800,
            1609459200,
            -1,
            -86400,
        ];

        testUnixTimes.forEach((unixTimeSec) => {
            const result = unixTimeSecToIsoDateString(unixTimeSec);
            const expected = new Date(unixTimeSec * 1000).toISOString();

            expect(result).toBe(expected);
        });
    });

    it('should handle edge cases around epoch boundaries', () => {
        const testCases = [
            {
                unixTimeSec: 0,
                expectedIsoDate: '1970-01-01T00:00:00.000Z',
            },
            {
                unixTimeSec: 1,
                expectedIsoDate: '1970-01-01T00:00:01.000Z',
            },
            {
                unixTimeSec: 59,
                expectedIsoDate: '1970-01-01T00:00:59.000Z',
            },
            {
                unixTimeSec: 60,
                expectedIsoDate: '1970-01-01T00:01:00.000Z',
            },
            {
                unixTimeSec: 3600,
                expectedIsoDate: '1970-01-01T01:00:00.000Z',
            },
            {
                unixTimeSec: 86400,
                expectedIsoDate: '1970-01-02T00:00:00.000Z',
            },
        ];

        testCases.forEach(({ unixTimeSec, expectedIsoDate }) => {
            expect(unixTimeSecToIsoDateString(unixTimeSec)).toBe(expectedIsoDate);
        });
    });

    it('should handle large Unix timestamps (far future)', () => {
        const testCases = [
            {
                unixTimeSec: 2147483647, // Max 32-bit signed integer
                expectedIsoDate: '2038-01-19T03:14:07.000Z',
            },
            {
                unixTimeSec: 4102444800, // Year 2100
                expectedIsoDate: '2100-01-01T00:00:00.000Z',
            },
        ];

        testCases.forEach(({ unixTimeSec, expectedIsoDate }) => {
            expect(unixTimeSecToIsoDateString(unixTimeSec)).toBe(expectedIsoDate);
        });
    });
});
