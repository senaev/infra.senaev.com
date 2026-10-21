import {
    describe, expect, it,
} from 'vitest';

import { simpleMovingAverageUsingAccFabric } from './simpleMovingAverageUsingAccFabric';

describe('simpleMovingAverageFabric', () => {
    it('should return a function that calculates the simple moving average for latest values', () => {
        const fabric = simpleMovingAverageUsingAccFabric(3);

        expect(fabric(1)).toBe(undefined);
        expect(fabric(2)).toBe(undefined);
        const actual = Array.from({ length: 9997 }, (_, index) => fabric(index + 3));

        expect(actual).toEqual(Array.from({ length: 9997 }, (_, index) => index + 2));
    });

    it('should consider window size', () => {
        const fabric = simpleMovingAverageUsingAccFabric(5);

        const result: (number | undefined)[] = [];

        for (let i = 4; i > -10; i--) {
            result.push(fabric(i));
        }

        expect(result).toEqual([
            undefined,
            undefined,
            undefined,
            undefined,
            1.9999999999999998,
            0.9999999999999998,
            -2.220446049250313e-16,
            -1.0000000000000002,
            -2,
            -3,
            -4,
            -5,
            -6,
            -7,
        ]);
    });

    it('should consider window size', () => {
        const fabric = simpleMovingAverageUsingAccFabric(1);

        for (let i = 1000; i < 1010; i++) {
            expect(fabric(i)).toBe(i);
        }
    });

    it('can calculate big windows', () => {
        const fabric = simpleMovingAverageUsingAccFabric(10_001);

        const results = Array.from({ length: 20_000 }, (_, index) => fabric(index));

        expect(results.slice(0, 10_000).every((value) => value === undefined)).toBe(true);
        expect(results.slice(10_000).every((value, index) =>
            typeof value === 'number' && Math.abs(value - (index + 5000)) <= 1e-10)).toBe(true);
    });
});
