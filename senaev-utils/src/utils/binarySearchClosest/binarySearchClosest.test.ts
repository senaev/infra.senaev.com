import {
    describe,
    expect,
    it,
} from 'vitest';

import { binarySearchClosest } from './binarySearchClosest';

describe('binarySearchClosest', () => {
    it('should return the correct index when the element is found', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];
        const compareFunction = (a: number) => a - 3;
        const result = binarySearchClosest(arr, compareFunction);
        expect(result).toBe(2);
    });

    it('should return the closest index when the element is not found', () => {
        const result = binarySearchClosest([
            1,
            2,
            4,
            5,
            6,
        ], (a: number) => a - 3);

        expect(result).toBe(1);
    });

    it('should throw error for an empty array', () => {
        expect(() => binarySearchClosest([], (a: number) => a - 3)).toThrowError();
    });

    it('should handle arrays with one element', () => {
        const arr = [3];
        const compareFunction = (a: number) => a - 3;
        const result = binarySearchClosest(arr, compareFunction);
        expect(result).toBe(0);
    });

    it('should handle arrays with two elements', () => {
        const arr = [
            1,
            3,
        ];
        const compareFunction = (a: number) => a - 2;
        const result = binarySearchClosest(arr, compareFunction);
        expect(result).toBe(0);
    });

    it('should return closest value', () => {
        const arr = [
            1,
            3,
        ];
        expect(binarySearchClosest(arr, (a: number) => a - 2.0001)).toBe(1);
        expect(binarySearchClosest(arr, (a: number) => a - 1.99999)).toBe(0);
    });

    it('should return closest value in array with odd count of elements', () => {
        const arr = [
            0,
            1,
            3,
        ];
        expect(binarySearchClosest(arr, (a: number) => a - 2.0001)).toBe(2);
        expect(binarySearchClosest(arr, (a: number) => a - 1.99999)).toBe(1);
    });

    it('should use compare function', () => {
        const arr = [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
        ];
        expect(binarySearchClosest(arr, (a) => a / 3.001 - 3)).toBe(9);
        expect(binarySearchClosest(arr, (a) => a / 2.5 - 2)).toBe(5);
    });
});
