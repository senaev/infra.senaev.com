import {
    describe, expect, it,
} from 'vitest';

import { mean } from './mean';

describe('mean', () => {
    it('can get the mean of two numbers', () => {
        expect(mean([
            1,
            2,
        ])).toBe(1.5);
    });

    it('can get the mean of one number', () => {
        expect(mean([1])).toBe(1);
    });

    it('an empty list has no average', () => {
        expect(() => {
            mean([]);
        }).toThrow('mean requires at least one data point');
    });
});
