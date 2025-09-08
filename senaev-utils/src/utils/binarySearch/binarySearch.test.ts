import {
    describe,
    expect,
    it,
} from 'vitest';

import { binarySearch } from './binarySearch';

describe('binarySearch', () => {
    it('should return the correct index when the element is found in the middle', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];
        const result = binarySearch(arr, 3);

        expect(result).toBe(2);
    });

    it('should return the correct index when the element is found at the beginning', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];
        const result = binarySearch(arr, 1);

        expect(result).toBe(0);
    });

    it('should return the correct index when the element is found at the end', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];
        const result = binarySearch(arr, 5);

        expect(result).toBe(4);
    });

    it('should return -1 when the element is not found', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];
        const result = binarySearch(arr, 6);

        expect(result).toBe(-1);
    });

    it('should return -1 when searching for element smaller than all elements', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];
        const result = binarySearch(arr, 0);

        expect(result).toBe(-1);
    });

    it('should return -1 when searching for element larger than all elements', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];
        const result = binarySearch(arr, 10);

        expect(result).toBe(-1);
    });

    it('should handle arrays with one element', () => {
        const arr = [42];
        const result = binarySearch(arr, 42);

        expect(result).toBe(0);
    });

    it('should return -1 for single element array when element not found', () => {
        const arr = [42];
        const result = binarySearch(arr, 10);

        expect(result).toBe(-1);
    });

    it('should handle arrays with two elements', () => {
        const arr = [
            1,
            3,
        ];

        expect(binarySearch(arr, 1)).toBe(0);
        expect(binarySearch(arr, 3)).toBe(1);
        expect(binarySearch(arr, 2)).toBe(-1);
    });

    it('should handle empty arrays', () => {
        const arr: number[] = [];
        const result = binarySearch(arr, 1);

        expect(result).toBe(-1);
    });

    it('should work with string arrays', () => {
        const arr = [
            'apple',
            'banana',
            'cherry',
            'date',
            'elderberry',
        ];

        expect(binarySearch(arr, 'cherry')).toBe(2);
        expect(binarySearch(arr, 'apple')).toBe(0);
        expect(binarySearch(arr, 'elderberry')).toBe(4);
        expect(binarySearch(arr, 'grape')).toBe(-1);
    });

    it('should work with arrays containing duplicate values', () => {
        const arr = [
            1,
            2,
            2,
            3,
            3,
            3,
            4,
            5,
        ];

        // Should return one of the valid indices for duplicates
        const result = binarySearch(arr, 2);

        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(2);
        expect(arr[result]).toBe(2);
    });

    it('should work with large arrays', () => {
        const arr = Array.from({ length: 1000 }, (_, i) => i * 2);

        expect(binarySearch(arr, 0)).toBe(0);
        expect(binarySearch(arr, 998)).toBe(499);
        expect(binarySearch(arr, 1998)).toBe(999);
        expect(binarySearch(arr, 1)).toBe(-1);
        expect(binarySearch(arr, 1999)).toBe(-1);
    });

    it('should work with negative numbers', () => {
        const arr = [
            -10,
            -5,
            -1,
            0,
            1,
            5,
            10,
        ];

        expect(binarySearch(arr, -10)).toBe(0);
        expect(binarySearch(arr, 0)).toBe(3);
        expect(binarySearch(arr, 10)).toBe(6);
        expect(binarySearch(arr, -3)).toBe(-1);
    });

    it('should work with floating point numbers', () => {
        const arr = [
            1.1,
            2.2,
            3.3,
            4.4,
            5.5,
        ];

        expect(binarySearch(arr, 3.3)).toBe(2);
        expect(binarySearch(arr, 1.1)).toBe(0);
        expect(binarySearch(arr, 5.5)).toBe(4);
        expect(binarySearch(arr, 2.5)).toBe(-1);
    });

    it('should work with objects when using reference equality', () => {
        const obj1 = { id: 1 };
        const obj2 = { id: 2 };
        const obj3 = { id: 3 };
        const arr = [
            obj1,
            obj2,
            obj3,
        ];

        expect(binarySearch(arr, { id: 2 })).toBe(-1);
    });

    it('should handle edge case with odd-length arrays', () => {
        const arr = [
            1,
            3,
            5,
            7,
            9,
        ];

        expect(binarySearch(arr, 5)).toBe(2);
        expect(binarySearch(arr, 1)).toBe(0);
        expect(binarySearch(arr, 9)).toBe(4);
        expect(binarySearch(arr, 4)).toBe(-1);
    });

    it('should handle edge case with even-length arrays', () => {
        const arr = [
            2,
            4,
            6,
            8,
        ];

        expect(binarySearch(arr, 4)).toBe(1);
        expect(binarySearch(arr, 6)).toBe(2);
        expect(binarySearch(arr, 2)).toBe(0);
        expect(binarySearch(arr, 8)).toBe(3);
        expect(binarySearch(arr, 5)).toBe(-1);
    });

    it('should return correct type (UnsignedInteger or -1)', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
        ];

        const foundResult = binarySearch(arr, 3);
        const notFoundResult = binarySearch(arr, 6);

        expect(typeof foundResult).toBe('number');
        expect(typeof notFoundResult).toBe('number');
        expect(foundResult).toBeGreaterThanOrEqual(0);
        expect(notFoundResult).toBe(-1);
    });
});
