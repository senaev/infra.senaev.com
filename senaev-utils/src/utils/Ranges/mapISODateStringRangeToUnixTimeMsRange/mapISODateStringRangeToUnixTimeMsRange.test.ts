import {
    describe,
    expect,
    it,
} from 'vitest';

import { RangeTuple } from '../../../types/RangeTuple';
import { ISODateString } from '../../../types/Time/ISODateString/ISODateString';

import { mapISODateStringRangeToUnixTimeMsRange } from './mapISODateStringRangeToUnixTimeMsRange';

describe('mapISODateStringRangeToUnixTimeMsRange', () => {
    it('should correctly convert ISO date string range to Unix timestamp ms range', () => {
        const isoRange: RangeTuple<ISODateString> = [
            '2023-01-01T00:00:00.000Z',
            '2023-12-31T23:59:59.999Z',
        ];

        const expected: RangeTuple<number> = [
            1672531200000, // 2023-01-01T00:00:00.000Z in ms
            1704067199999, // 2023-12-31T23:59:59.999Z in ms
        ];

        const result = mapISODateStringRangeToUnixTimeMsRange(isoRange);

        expect(result).toEqual(expected);
    });

    it('should handle same start and end dates', () => {
        const isoRange: RangeTuple<ISODateString> = [
            '2023-06-15T12:00:00.000Z',
            '2023-06-15T12:00:00.000Z',
        ];

        const timestamp = 1686830400000; // 2023-06-15T12:00:00.000Z in ms
        const expected: RangeTuple<number> = [
            timestamp,
            timestamp,
        ];

        const result = mapISODateStringRangeToUnixTimeMsRange(isoRange);

        expect(result).toEqual(expected);
    });

    it('should handle dates with different timezones', () => {
        const isoRange: RangeTuple<ISODateString> = [
            '2023-01-01T00:00:00.000Z',
            '2023-01-02T00:00:00.000+01:00',
        ];

        const expected: RangeTuple<number> = [
            1672531200000, // 2023-01-01T00:00:00.000Z in ms
            1672614000000, // 2023-01-01T23:00:00.000Z in ms (converted from +01:00)
        ];

        const result = mapISODateStringRangeToUnixTimeMsRange(isoRange);

        expect(result).toEqual(expected);
    });
});
