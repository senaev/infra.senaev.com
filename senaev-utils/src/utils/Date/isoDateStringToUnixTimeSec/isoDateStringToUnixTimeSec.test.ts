import {
    describe,
    expect,
    it,
} from 'vitest';

import { isoDateStringToUnixTimeMs } from '../isoDateStringToUnixTimeMs/isoDateStringToUnixTimeMs';

import { isoDateStringToUnixTimeSec } from './isoDateStringToUnixTimeSec';

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
