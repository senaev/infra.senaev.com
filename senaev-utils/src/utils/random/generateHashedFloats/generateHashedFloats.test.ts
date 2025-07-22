import {
    describe, expect, it,
} from 'vitest';

import { generateHashedFloats } from './generateHashedFloats';

describe('generateHashedFloats', () => {
    it('should return the correct number of floats', () => {
        const count = 5;
        const result = generateHashedFloats('test-seed', count);

        expect(result).toHaveLength(count);
    });

    it('should return floats between 0 and 1', () => {
        const result = generateHashedFloats('test-seed', 100);

        result.forEach((float) => {
            expect(float).toBeGreaterThanOrEqual(0);
            expect(float).toBeLessThan(1);
        });
    });

    it('should return the same sequence for the same seed', () => {
        const seed = 'test-seed';
        const result1 = generateHashedFloats(seed, 10);
        const result2 = generateHashedFloats(seed, 10);

        expect(result1).toEqual(result2);
    });

    it('should return different sequences for different seeds', () => {
        const result1 = generateHashedFloats('seed1', 10);
        const result2 = generateHashedFloats('seed2', 10);

        expect(result1).not.toEqual(result2);
    });

    it('should produce reasonably well-distributed floats', () => {
        const result = generateHashedFloats('test-seed', 1000);

        // Check distribution across quartiles
        const quartiles = [
            0,
            0.25,
            0.5,
            0.75,
            1,
        ];
        const counts = new Array(4).fill(0);

        result.forEach((float) => {
            for (let i = 0; i < 4; i++) {
                if (float >= quartiles[i] && float < quartiles[i + 1]) {
                    counts[i]++;
                    break;
                }
            }
        });

        // Each quartile should have roughly 25% of the values
        // Allow for some deviation (±10%)
        counts.forEach((count) => {
            expect(count).toBeGreaterThan(200); // 20% of 1000
            expect(count).toBeLessThan(300); // 30% of 1000
        });
    });
});
