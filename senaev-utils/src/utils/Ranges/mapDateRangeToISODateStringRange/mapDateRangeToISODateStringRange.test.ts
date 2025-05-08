import {
    describe,
    expect,
    it,
} from 'vitest';

import { RangeTuple } from '../../../types/RangeTuple';

import { mapDateRangeToISODateStringRange } from './mapDateRangeToISODateStringRange';

describe('mapDateRangeToISODateStringRange', () => {
    it('should correctly convert a Date range to ISO date string range', () => {
        const input: RangeTuple<Date> = [
            new Date('2021-01-01T00:00:00.000Z'),
            new Date('2021-01-02T00:00:00.000Z'),
        ];

        const expected = [
            '2021-01-01T00:00:00.000Z',
            '2021-01-02T00:00:00.000Z',
        ];

        const result = mapDateRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });

    it('should handle same start and end dates', () => {
        const date = new Date('2021-01-01T00:00:00.000Z');
        const input: RangeTuple<Date> = [
            date,
            date,
        ];

        const expected = [
            '2021-01-01T00:00:00.000Z',
            '2021-01-01T00:00:00.000Z',
        ];

        const result = mapDateRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });

    it('should handle dates with milliseconds', () => {
        const input: RangeTuple<Date> = [
            new Date('2021-01-01T00:00:00.123Z'),
            new Date('2021-01-02T00:00:00.456Z'),
        ];

        const expected = [
            '2021-01-01T00:00:00.123Z',
            '2021-01-02T00:00:00.456Z',
        ];

        const result = mapDateRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });

    it('should handle dates before 1970', () => {
        const input: RangeTuple<Date> = [
            new Date('1900-01-01T00:00:00.000Z'),
            new Date('1900-01-02T00:00:00.000Z'),
        ];

        const expected = [
            '1900-01-01T00:00:00.000Z',
            '1900-01-02T00:00:00.000Z',
        ];

        const result = mapDateRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });
});
