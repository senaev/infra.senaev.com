import {
    describe,
    expect,
    it,
} from 'vitest';

import {
    assertISODateString, isISODateString, isoDateStringToUnixTimeMs, isoDateStringToUnixTimeSec
} from './ISODateString';

describe('ISODateString', () => {
    describe('isISODateString', () => {
        it('should return true for valid ISO date strings', () => {
            const validDates = [
                '2025-01-01T07:29:12.263Z',
                '2023-12-31T23:59:59.999Z',
                '2023-12-31T23:59:59.999Z',
                new Date().toISOString(),
            ];

            validDates.forEach((date) => {
                expect(isISODateString(date)).toBe(true);
            });
        });

        it('should return false for invalid ISO date strings', () => {
            const invalidDates = [
                '2025-01-01', // missing time component
                '2025/01/01T07:29:12.263Z', // wrong date separator
                '2025-01-01T07:29:12', // missing milliseconds and Z
                '2025-13-01T07:29:12.263Z', // invalid month
                'invalid date',
                '',
            ];

            invalidDates.forEach((date) => {
                expect(isISODateString(date)).toBe(false);
            });
        });
    });

    describe('assertISODateString', () => {
        it('should not throw for valid ISO date strings', () => {
            const validDates = [
                '2025-01-01T07:29:12.263Z',
                '2023-12-31T23:59:59.999Z',
                new Date().toISOString(),
            ];

            validDates.forEach((date) => {
                expect(() => assertISODateString(date)).not.toThrow();
            });
        });

        it('should throw for invalid ISO date strings', () => {
            const invalidDates = [
                '2025-01-01',
                '2025/01/01T07:29:12.263Z',
                '2025-01-01T07:29:12',
                '2025-13-01T07:29:12.263Z',
                'invalid date',
                '',
            ];

            invalidDates.forEach((date) => {
                expect(() => assertISODateString(date, 'errorMessage')).toThrow(`date=[${date}] is not a valid ISO date string errorMessage=[errorMessage]`);
            });
        });
    });

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

    describe('isoDateStringToUnixTimeSec', () => {
        it('should convert ISO date string to Unix time in seconds', () => {
            const testCases = [
                {
                    isoDate: '2025-01-01T00:00:00.000Z',
                    expectedSec: 1735689600,
                },
                {
                    isoDate: '2023-12-31T23:59:59.999Z',
                    expectedSec: 1704067199,
                },
                {
                    isoDate: '1970-01-01T00:00:00.000Z',
                    expectedSec: 0,
                },
                {
                    isoDate: '1970-01-01T00:00:00.500Z',
                    expectedSec: 0,
                },
                {
                    isoDate: '1970-01-01T00:00:01.000Z',
                    expectedSec: 1,
                },
            ];

            testCases.forEach(({ isoDate, expectedSec }) => {
                expect(isoDateStringToUnixTimeSec(isoDate)).toBe(expectedSec);
            });
        });

        it('should return the same result as dividing milliseconds by 1000', () => {
            const testDates = [
                '2025-01-01T00:00:00.000Z',
                '2023-12-31T23:59:59.999Z',
                '1970-01-01T00:00:00.000Z',
                '1970-01-01T00:00:00.500Z',
                '1970-01-01T00:00:01.000Z',
            ];

            testDates.forEach((isoDate) => {
                const msResult = isoDateStringToUnixTimeMs(isoDate);
                const secResult = isoDateStringToUnixTimeSec(isoDate);

                expect(secResult).toBe(Math.floor(msResult / 1000));
            });
        });

        it('should handle current date correctly', () => {
            const now = new Date();
            const isoString = now.toISOString();
            const expectedSec = Math.floor(now.getTime() / 1000);

            expect(isoDateStringToUnixTimeSec(isoString)).toBe(expectedSec);
        });
    });
});
