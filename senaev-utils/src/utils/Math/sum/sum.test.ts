import {
    describe, expect, it,
} from 'vitest';

import { sum } from './sum';

describe('sum', () => {
    it('can get the sum of two numbers', () => {
        expect(sum([
            1,
            2,
        ])).toBe(3);
    });

    it('the sum of no numbers is zero', () => {
        expect(sum([])).toBe(0);
    });

    it('returns NaN if a non-number is given', () => {
        expect(Number.isNaN(sum([
            1,
            null as unknown as number,
        ])));
        expect(Number.isNaN(sum([
            null as unknown as number,
            1,
        ])));
        expect(Number.isNaN(sum([
            1,
            2,
            null as unknown as number,
        ])));
        expect(Number.isNaN(sum([
            1,
            2,
            true as unknown as number,
        ])));
    });
});
