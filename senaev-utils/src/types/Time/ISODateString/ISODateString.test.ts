import {
    describe,
    expect,
    it,
} from 'vitest';

import { assertISODateString, isISODateString } from './ISODateString';

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
});
