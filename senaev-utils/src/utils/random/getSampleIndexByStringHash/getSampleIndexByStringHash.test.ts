import {
    describe,
    expect,
    it,
} from 'vitest';

import { createArray } from '../../Array/createArray/createArray';

import { getSampleIndexByStringHash } from './getSampleIndexByStringHash';

describe('getSampleIndexByStringHash', () => {
    it('should return the same index for the same string and maxInteger', () => {
        const str = 'hello world';
        const maxInteger = 10;
        expect(getSampleIndexByStringHash(str, maxInteger)).toBe(getSampleIndexByStringHash(str, maxInteger));
    });

    it('should return different indices for different strings', () => {
        const maxInteger = 10;
        expect(getSampleIndexByStringHash('foo', maxInteger)).not.toBe(getSampleIndexByStringHash('bar', maxInteger));
    });

    it('should return an index within the range of maxInteger', () => {
        const str = 'test';
        const maxInteger = 5;
        const index = getSampleIndexByStringHash(str, maxInteger);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(maxInteger);
    });

    it('should handle empty string', () => {
        const maxInteger = 10;
        expect(getSampleIndexByStringHash('', maxInteger)).toBe(1);
    });

    it('should handle unicode characters', () => {
        const maxInteger = 10;
        expect(getSampleIndexByStringHash('😀', maxInteger)).toBe(getSampleIndexByStringHash('😀', maxInteger));
        expect(getSampleIndexByStringHash('��', maxInteger)).not.toBe(getSampleIndexByStringHash('😁', maxInteger));
    });

    it('should handle maxInteger of 1', () => {
        const str = 'test';
        expect(getSampleIndexByStringHash(str, 1)).toBe(0);
    });

    it('should handle maxInteger of 0', () => {
        const str = 'test';
        expect(getSampleIndexByStringHash(str, 0)).toBe(NaN);
    });

    it('values should be random', () => {
        const expectedValues = [
            3,
            4,
            1,
            2,
            7,
            8,
            5,
            6,
            5,
            6,
            2,
            1,
            0,
            9,
            6,
            5,
            4,
            3,
            0,
            9,
            3,
            4,
            1,
            2,
            7,
            8,
            5,
            6,
            5,
            6,
            4,
            3,
            6,
            5,
            0,
            9,
            2,
            1,
            6,
            5,
            9,
            0,
            1,
            2,
            5,
            6,
            7,
            8,
            1,
            2,
            0,
            9,
            8,
            7,
            6,
            5,
            4,
            3,
            2,
            1,
            3,
            4,
            1,
            2,
            9,
            0,
            7,
            8,
            1,
            2,
            8,
            7,
            0,
            9,
            2,
            1,
            4,
            3,
            0,
            9,
            7,
            8,
            9,
            0,
            1,
            2,
            3,
            4,
            9,
            0,
            6,
            5,
            4,
            3,
            0,
            9,
            8,
            7,
            8,
            7,
        ];

        const result = createArray(100).map((_, i) => getSampleIndexByStringHash(String(i), 10));
        expect(result).toEqual(expectedValues);
    });
});
