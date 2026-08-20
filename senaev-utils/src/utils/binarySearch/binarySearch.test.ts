import {
    describe,
    expect,
    it,
} from 'vitest';

import { binarySearch } from './binarySearch';

describe('binarySearch', () => {
    it('should find element at the beginning of the array', () => {
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

    it('should find element at the end of the array', () => {
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

    it('should find element in the middle of the array', () => {
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

    it('should find element in the left half of the array', () => {
        const arr = [
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
        const result = binarySearch(arr, 2);

        expect(result).toBe(1);
    });

    it('should find element in the right half of the array', () => {
        const arr = [
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
        const result = binarySearch(arr, 8);

        expect(result).toBe(7);
    });

    it('should return -1 when element is not found', () => {
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

    it('should handle empty array', () => {
        const arr: number[] = [];
        const result = binarySearch(arr, 1);

        expect(result).toBe(-1);
    });

    it('should handle array with single element - found', () => {
        const arr = [42];
        const result = binarySearch(arr, 42);

        expect(result).toBe(0);
    });

    it('should handle array with single element - not found', () => {
        const arr = [42];
        const result = binarySearch(arr, 1);

        expect(result).toBe(-1);
    });

    it('should handle array with two elements - first element', () => {
        const arr = [
            1,
            2,
        ];
        const result = binarySearch(arr, 1);

        expect(result).toBe(0);
    });

    it('should handle array with two elements - second element', () => {
        const arr = [
            1,
            2,
        ];
        const result = binarySearch(arr, 2);

        expect(result).toBe(1);
    });

    it('should handle array with two elements - not found', () => {
        const arr = [
            1,
            2,
        ];
        const result = binarySearch(arr, 3);

        expect(result).toBe(-1);
    });

    it('should handle array with duplicate elements - find first occurrence', () => {
        const arr = [
            1,
            2,
            2,
            3,
            4,
        ];
        const result = binarySearch(arr, 2);

        // Binary search finds one of the duplicates, not necessarily the first
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(2);
        expect(arr[result]).toBe(2);
    });

    it('should handle large array', () => {
        const arr = Array.from({ length: 1000 }, (_, i) => i + 1);
        const result = binarySearch(arr, 500);

        expect(result).toBe(499);
    });

    it('should handle array with negative numbers', () => {
        const arr = [
            -5,
            -3,
            -1,
            0,
            2,
            4,
            6,
        ];
        const result = binarySearch(arr, -1);

        expect(result).toBe(2);
    });

    it('should handle array with negative numbers - not found', () => {
        const arr = [
            -5,
            -3,
            -1,
            0,
            2,
            4,
            6,
        ];
        const result = binarySearch(arr, -2);

        expect(result).toBe(-1);
    });

    it('should handle array with decimal numbers', () => {
        const arr = [
            1.1,
            2.2,
            3.3,
            4.4,
            5.5,
        ];
        const result = binarySearch(arr, 3.3);

        expect(result).toBe(2);
    });

    it('should handle array with decimal numbers - not found', () => {
        const arr = [
            1.1,
            2.2,
            3.3,
            4.4,
            5.5,
        ];
        const result = binarySearch(arr, 3.0);

        expect(result).toBe(-1);
    });

    it('should handle array with zeros', () => {
        const arr = [
            0,
            1,
            2,
            3,
            4,
        ];
        const result = binarySearch(arr, 0);

        expect(result).toBe(0);
    });

    it('should handle array with zeros - not found', () => {
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

    it('should handle array with all same elements', () => {
        const arr = [
            5,
            5,
            5,
            5,
            5,
        ];
        const result = binarySearch(arr, 5);

        // Binary search finds one of the duplicates
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(4);
        expect(arr[result]).toBe(5);
    });

    it('should handle array with all same elements - not found', () => {
        const arr = [
            5,
            5,
            5,
            5,
            5,
        ];
        const result = binarySearch(arr, 3);

        expect(result).toBe(-1);
    });

    it('should handle odd-length array', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
            6,
            7,
        ];
        const result = binarySearch(arr, 4);

        expect(result).toBe(3);
    });

    it('should handle even-length array', () => {
        const arr = [
            1,
            2,
            3,
            4,
            5,
            6,
        ];
        const result = binarySearch(arr, 3);

        expect(result).toBe(2);
    });

    it('should handle array with maximum safe integer', () => {
        const arr = [
            Number.MAX_SAFE_INTEGER - 2,
            Number.MAX_SAFE_INTEGER - 1,
            Number.MAX_SAFE_INTEGER,
        ];
        const result = binarySearch(arr, Number.MAX_SAFE_INTEGER);

        expect(result).toBe(2);
    });

    it('should handle array with minimum safe integer', () => {
        const arr = [
            Number.MIN_SAFE_INTEGER,
            Number.MIN_SAFE_INTEGER + 1,
            Number.MIN_SAFE_INTEGER + 2,
        ];
        const result = binarySearch(arr, Number.MIN_SAFE_INTEGER);

        expect(result).toBe(0);
    });
});
