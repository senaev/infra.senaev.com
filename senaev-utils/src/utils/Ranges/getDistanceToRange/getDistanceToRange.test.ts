import {
    describe,
    expect,
    it,
} from 'vitest';

import type { RangeTuple } from '../../../types/RangeTuple';

import { getDistanceToRange } from './getDistanceToRange';

describe('getDistanceToRange', () => {
    it('should return 0 when value is within the range', () => {
        const range: RangeTuple<number> = [
            1,
            5,
        ];

        expect(getDistanceToRange(range, 1)).toBe(0);
        expect(getDistanceToRange(range, 3)).toBe(0);
        expect(getDistanceToRange(range, 5)).toBe(0);
    });

    it('should return 0 when value is at range boundaries', () => {
        const range: RangeTuple<number> = [
            10,
            20,
        ];

        expect(getDistanceToRange(range, 10)).toBe(0);
        expect(getDistanceToRange(range, 20)).toBe(0);
    });

    it('should return positive distance when value is below range', () => {
        const range: RangeTuple<number> = [
            5,
            10,
        ];

        expect(getDistanceToRange(range, 0)).toBe(5);
        expect(getDistanceToRange(range, 2)).toBe(3);
        expect(getDistanceToRange(range, 4)).toBe(1);
    });

    it('should return positive distance when value is above range', () => {
        const range: RangeTuple<number> = [
            5,
            10,
        ];

        expect(getDistanceToRange(range, 11)).toBe(-1);
        expect(getDistanceToRange(range, 15)).toBe(-5);
        expect(getDistanceToRange(range, 100)).toBe(-90);
    });

    it('should handle negative ranges', () => {
        const range: RangeTuple<number> = [
            -10,
            -5,
        ];

        // Value within range
        expect(getDistanceToRange(range, -10)).toBe(0);
        expect(getDistanceToRange(range, -7)).toBe(0);
        expect(getDistanceToRange(range, -5)).toBe(0);

        // Value below range
        expect(getDistanceToRange(range, -15)).toBe(5);
        expect(getDistanceToRange(range, -12)).toBe(2);

        // Value above range
        expect(getDistanceToRange(range, -4)).toBe(-1);
        expect(getDistanceToRange(range, 0)).toBe(-5);
    });

    it('should handle ranges crossing zero', () => {
        const range: RangeTuple<number> = [
            -5,
            5,
        ];

        // Value within range
        expect(getDistanceToRange(range, -5)).toBe(0);
        expect(getDistanceToRange(range, 0)).toBe(0);
        expect(getDistanceToRange(range, 5)).toBe(0);

        // Value below range
        expect(getDistanceToRange(range, -10)).toBe(5);
        expect(getDistanceToRange(range, -7)).toBe(2);

        // Value above range
        expect(getDistanceToRange(range, 7)).toBe(-2);
        expect(getDistanceToRange(range, 10)).toBe(-5);
    });

    it('should handle single-point ranges', () => {
        const range: RangeTuple<number> = [
            5,
            5,
        ];

        expect(getDistanceToRange(range, 5)).toBe(0);
        expect(getDistanceToRange(range, 3)).toBe(2);
        expect(getDistanceToRange(range, 7)).toBe(-2);
    });

    it('should handle decimal values', () => {
        const range: RangeTuple<number> = [
            1.5,
            3.7,
        ];

        // Value within range
        expect(getDistanceToRange(range, 1.5)).toBe(0);
        expect(getDistanceToRange(range, 2.6)).toBe(0);
        expect(getDistanceToRange(range, 3.7)).toBe(0);

        // Value below range
        expect(getDistanceToRange(range, 0.5)).toBe(1);
        expect(getDistanceToRange(range, 1.2)).toBe(0.30000000000000004);

        // Value above range
        expect(getDistanceToRange(range, 4.0)).toBe(-0.2999999999999998);
        expect(getDistanceToRange(range, 5.5)).toBe(-1.7999999999999998);
    });

    it('should handle very large numbers', () => {
        const range: RangeTuple<number> = [
            1000000,
            2000000,
        ];

        expect(getDistanceToRange(range, 1000000)).toBe(0);
        expect(getDistanceToRange(range, 1500000)).toBe(0);
        expect(getDistanceToRange(range, 2000000)).toBe(0);
        expect(getDistanceToRange(range, 500000)).toBe(500000);
        expect(getDistanceToRange(range, 3000000)).toBe(-1000000);
    });

    it('should handle very small numbers', () => {
        const range: RangeTuple<number> = [
            0.0001,
            0.0002,
        ];

        expect(getDistanceToRange(range, 0.0001)).toBe(0);
        expect(getDistanceToRange(range, 0.00015)).toBe(0);
        expect(getDistanceToRange(range, 0.0002)).toBe(0);
        expect(getDistanceToRange(range, 0.00005)).toBe(0.00005);
        expect(getDistanceToRange(range, 0.0003)).toBe(-0.00009999999999999996);
    });
});
