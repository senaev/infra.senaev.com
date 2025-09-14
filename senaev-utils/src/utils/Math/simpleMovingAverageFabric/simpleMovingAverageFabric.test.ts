import {
    describe, expect, it,
} from 'vitest';

import { simpleMovingAverageFabric } from './simpleMovingAverageFabric';

describe('simpleMovingAverageFabric', () => {
    it('should return a function that calculates the simple moving average for latest values', () => {
        const fabric = simpleMovingAverageFabric(3);

        expect(fabric(1)).toBe(undefined);
        expect(fabric(2)).toBe(undefined);
        for (let i = 3; i < 10_000; i++) {
            expect(fabric(i)).toBe(i - 1);
        }
    });

    it('should consider window size', () => {
        const fabric = simpleMovingAverageFabric(5);

        const result: (number | undefined)[] = [];

        for (let i = 4; i > -10; i--) {
            result.push(fabric(i));
        }

        expect(result).toEqual([
            undefined,
            undefined,
            undefined,
            undefined,
            2,
            1,
            0,
            -1,
            -2,
            -3,
            -4,
            -5,
            -6,
            -7,
        ]);
    });

    it('should consider window size', () => {
        const fabric = simpleMovingAverageFabric(1);

        for (let i = 1000; i < 1010; i++) {
            expect(fabric(i)).toBe(i);
        }
    });
});
