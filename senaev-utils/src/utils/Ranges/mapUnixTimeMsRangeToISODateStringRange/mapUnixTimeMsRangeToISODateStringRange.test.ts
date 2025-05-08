import {
    describe,
    expect,
    it,
} from 'vitest';

import { RangeTuple } from '../../../types/RangeTuple';
import { UnixTimeMs } from '../../../types/Time/UnixTimeMs';

import { mapUnixTimeMsRangeToISODateStringRange } from './mapUnixTimeMsRangeToISODateStringRange';

describe('mapUnixTimeMsRangeToISODateStringRange', () => {
    it('should correctly convert a Unix timestamp range to ISO date string range', () => {
        const input: RangeTuple<UnixTimeMs> = [
            1609459200000, // 2021-01-01T00:00:00.000Z
            1609545600000, // 2021-01-02T00:00:00.000Z
        ];

        const expected = [
            '2021-01-01T00:00:00.000Z',
            '2021-01-02T00:00:00.000Z',
        ];

        const result = mapUnixTimeMsRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });

    it('should handle same start and end timestamps', () => {
        const timestamp = 1609459200000; // 2021-01-01T00:00:00.000Z
        const input: RangeTuple<UnixTimeMs> = [
            timestamp,
            timestamp,
        ];

        const expected = [
            '2021-01-01T00:00:00.000Z',
            '2021-01-01T00:00:00.000Z',
        ];

        const result = mapUnixTimeMsRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });

    it('should handle timestamps with milliseconds', () => {
        const input: RangeTuple<UnixTimeMs> = [
            1609459200123, // 2021-01-01T00:00:00.123Z
            1609545600456, // 2021-01-02T00:00:00.456Z
        ];

        const expected = [
            '2021-01-01T00:00:00.123Z',
            '2021-01-02T00:00:00.456Z',
        ];

        const result = mapUnixTimeMsRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });

    it('should handle negative timestamps (dates before 1970)', () => {
        const input: RangeTuple<UnixTimeMs> = [
            -2208988800000, // 1900-01-01T00:00:00.000Z
            -2208902400000, // 1900-01-02T00:00:00.000Z
        ];

        const expected = [
            '1900-01-01T00:00:00.000Z',
            '1900-01-02T00:00:00.000Z',
        ];

        const result = mapUnixTimeMsRangeToISODateStringRange(input);
        expect(result).toEqual(expected);
    });
});
