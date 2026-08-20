import {
    describe, expect, it,
} from 'vitest';

import { simpleMovingAverageUsingAccFabric } from './simpleMovingAverageUsingAccFabric';

describe('simpleMovingAverageFabric', () => {
    it('should return a function that calculates the simple moving average for latest values', () => {
        const fabric = simpleMovingAverageUsingAccFabric(3);

        expect(fabric(1)).toBe(undefined);
        expect(fabric(2)).toBe(undefined);
        for (let i = 3; i < 10_000; i++) {
            expect(fabric(i)).toBe(i - 1);
        }
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

        for (let i = 0; i < 20_000; i++) {
            if (i < 10_000) {
                expect(fabric(i)).toBe(undefined);
            } else {
                expect(fabric(i)).closeTo(i - 5000, 1e-10);
            }
        }
    });
});
