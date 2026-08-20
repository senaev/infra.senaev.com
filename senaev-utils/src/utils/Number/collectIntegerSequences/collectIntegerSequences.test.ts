import {
    describe, expect, it,
} from 'vitest';

import { collectIntegerSequences } from './collectIntegerSequences';

describe('collectIntegerSequences', () => {
    it('should handle empty array', () => {
        expect(collectIntegerSequences([])).toEqual([]);
    });

    it('should handle single number', () => {
        expect(collectIntegerSequences([1])).toEqual([
            {
                start: 1,
                length: 1,
            },
        ]);
    });

    it('should handle consecutive numbers', () => {
        expect(collectIntegerSequences([
            1,
            2,
            3,
            4,
            5,
        ])).toEqual([
            {
                start: 1,
                length: 5,
            },
        ]);
    });

    it('should handle non-consecutive numbers', () => {
        expect(collectIntegerSequences([
            1,
            3,
            5,
            7,
        ])).toEqual([
            {
                start: 1,
                length: 1,
            },
            {
                start: 3,
                length: 1,
            },
            {
                start: 5,
                length: 1,
            },
            {
                start: 7,
                length: 1,
            },
        ]);
    });

    it('should handle mixed sequences', () => {
        expect(collectIntegerSequences([
            1,
            2,
            3,
            5,
            6,
            8,
            9,
            10,
        ])).toEqual([
            {
                start: 1,
                length: 3,
            },
            {
                start: 5,
                length: 2,
            },
            {
                start: 8,
                length: 3,
            },
        ]);
    });

    it('should handle negative numbers', () => {
        expect(collectIntegerSequences([
            -3,
            -2,
            -1,
            0,
            1,
            2,
        ])).toEqual([
            {
                start: -3,
                length: 6,
            },
        ]);
    });
});
