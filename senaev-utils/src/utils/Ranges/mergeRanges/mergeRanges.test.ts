import {
    describe,
    expect,
    it,
} from 'vitest';

import { RangeTuple } from '../../../types/RangeTuple';

import { mergeRanges } from './mergeRanges';

describe('mergeRanges', () => {
    it('should return empty array for empty input', () => {
        expect(mergeRanges([])).toEqual([]);
    });

    it('should return single range unchanged', () => {
        expect(mergeRanges([
            [
                1,
                3,
            ],
        ])).toEqual([
            [
                1,
                3,
            ],
        ]);
    });

    it('should merge overlapping ranges', () => {
        expect(mergeRanges([
            [
                1,
                3,
            ],
            [
                2,
                4,
            ],
        ])).toEqual([
            [
                1,
                4,
            ],
        ]);

        expect(mergeRanges([
            [
                1,
                4,
            ],
            [
                2,
                3,
            ],
        ])).toEqual([
            [
                1,
                4,
            ],
        ]);
    });

    it('should merge multiple overlapping ranges', () => {
        expect(mergeRanges([
            [
                1,
                3,
            ],
            [
                2,
                6,
            ],
            [
                5,
                8,
            ],
        ])).toEqual([
            [
                1,
                8,
            ],
        ]);
    });

    it('should keep non-overlapping ranges separate', () => {
        expect(mergeRanges([
            [
                1,
                2,
            ],
            [
                4,
                5,
            ],
            [
                7,
                8,
            ],
        ])).toEqual([
            [
                1,
                2,
            ],
            [
                4,
                5,
            ],
            [
                7,
                8,
            ],
        ]);
    });

    it('should handle mix of overlapping and non-overlapping ranges', () => {
        expect(mergeRanges([
            [
                1,
                3,
            ],
            [
                2,
                4,
            ],
            [
                6,
                8,
            ],
            [
                9,
                10,
            ],
        ])).toEqual([
            [
                1,
                4,
            ],
            [
                6,
                8,
            ],
            [
                9,
                10,
            ],
        ]);
    });

    it('should handle ranges with same start point', () => {
        expect(mergeRanges([
            [
                1,
                4,
            ],
            [
                1,
                3,
            ],
        ])).toEqual([
            [
                1,
                4,
            ],
        ]);
    });

    it('should handle ranges with same end point', () => {
        expect(mergeRanges([
            [
                1,
                4,
            ],
            [
                2,
                4,
            ],
        ])).toEqual([
            [
                1,
                4,
            ],
        ]);
    });

    it('should handle completely contained ranges', () => {
        expect(mergeRanges([
            [
                1,
                6,
            ],
            [
                2,
                4,
            ],
        ])).toEqual([
            [
                1,
                6,
            ],
        ]);
    });

    it('should handle unsorted input ranges', () => {
        expect(mergeRanges([
            [
                2,
                4,
            ],
            [
                1,
                3,
            ],
        ])).toEqual([
            [
                1,
                4,
            ],
        ]);
    });

    it('does not sort original array', () => {
        const original: RangeTuple<number>[] = [
            [
                5,
                6,
            ],
            [
                1,
                3,
            ],
        ];

        mergeRanges(original);

        expect(original).toEqual([
            [
                5,
                6,
            ],
            [
                1,
                3,
            ],
        ]);
    });

    it('should not mutate input ranges', () => {
        const input: RangeTuple<number>[] = [
            [
                1,
                3,
            ],
            [
                2,
                4,
            ],
        ];
        const originalInput = JSON.parse(JSON.stringify(input));
        mergeRanges(input);
        expect(input).toEqual(originalInput);
    });
});
