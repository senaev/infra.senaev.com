import {
    describe, expect, it,
} from 'vitest';

import { checkRangesAdjacent } from './checkRangesAdjacent';

describe('checkRangesAdjacent', () => {
    it('should return true for adjacent ranges', () => {
        expect(checkRangesAdjacent([
            1,
            5,
        ], [
            5,
            10,
        ])).toBe(true);

        expect(checkRangesAdjacent([
            5,
            10,
        ], [
            1,
            5,
        ])).toBe(true);

        expect(checkRangesAdjacent(
            [
                -5,
                0,
            ],
            [
                0,
                5,
            ]
        )).toBe(true);

        expect(checkRangesAdjacent(
            [
                0,
                5,
            ],
            [
                -5,
                0,
            ]
        )).toBe(true);
    });

    it('should return false for non-adjacent ranges', () => {
        expect(checkRangesAdjacent([
            1,
            5,
        ], [
            6,
            10,
        ])).toBe(false);

        expect(checkRangesAdjacent([
            1,
            5,
        ], [
            4,
            10,
        ])).toBe(false);

        expect(checkRangesAdjacent([
            1,
            5,
        ], [
            0,
            3,
        ])).toBe(false);
    });

    it('should handle ranges with reversed order', () => {
        expect(checkRangesAdjacent([
            5,
            1,
        ], [
            5,
            10,
        ])).toBe(true);

        expect(checkRangesAdjacent([
            10,
            5,
        ], [
            5,
            1,
        ])).toBe(true);
    });

    it('should return false for overlapping ranges', () => {
        expect(checkRangesAdjacent([
            1,
            5,
        ], [
            3,
            7,
        ])).toBe(false);

        expect(checkRangesAdjacent([
            1,
            5,
        ], [
            1,
            5,
        ])).toBe(false);

        expect(checkRangesAdjacent([
            1,
            5,
        ], [
            3,
            5,
        ])).toBe(false);

        expect(checkRangesAdjacent([
            1,
            10,
        ], [
            5,
            7,
        ])).toBe(false);
    });
});
