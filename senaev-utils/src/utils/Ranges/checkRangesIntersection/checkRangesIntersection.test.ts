import {
    describe, expect, it,
} from 'vitest';

import { checkRangesIntersection } from './checkRangesIntersection';

describe('checkRangesIntersection', () => {
    it('should return true when ranges overlap', () => {
        expect(checkRangesIntersection([
            1,
            5,
        ], [
            3,
            7,
        ])).toBe(true);

        expect(checkRangesIntersection([
            3,
            7,
        ], [
            1,
            5,
        ])).toBe(true);
    });

    it('should return true when one range is contained within another', () => {
        expect(checkRangesIntersection([
            1,
            10,
        ], [
            3,
            7,
        ])).toBe(true);

        expect(checkRangesIntersection([
            3,
            7,
        ], [
            1,
            10,
        ])).toBe(true);
    });

    it('should return false when ranges touch at endpoints', () => {
        expect(checkRangesIntersection([
            1,
            5,
        ], [
            5,
            10,
        ])).toBe(false);

        expect(checkRangesIntersection([
            5,
            10,
        ], [
            1,
            5,
        ])).toBe(false);
    });

    it('should return false when ranges do not intersect', () => {
        expect(checkRangesIntersection([
            1,
            5,
        ], [
            6,
            10,
        ])).toBe(false);
        expect(checkRangesIntersection([
            6,
            10,
        ], [
            1,
            5,
        ])).toBe(false);
    });
});
