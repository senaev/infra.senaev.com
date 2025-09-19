import {
    describe, expect, it,
} from 'vitest';

import { findMapsDifferences } from './findMapsDifferences';

describe('findMapsDifferences', () => {
    it('should detect added keys', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
        const targetMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
            [
                'key3',
                'value3',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual(['key3']);
        expect(result.updated).toEqual([]);
        expect(result.deleted).toEqual([]);
    });

    it('should detect deleted keys', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
            [
                'key3',
                'value3',
            ],
        ]);
        const targetMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual([]);
        expect(result.deleted).toEqual(['key3']);
    });

    it('should detect updated values', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
        const targetMap = new Map([
            [
                'key1',
                'updatedValue1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual(['key1']);
        expect(result.deleted).toEqual([]);
    });

    it('should handle multiple changes', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
            [
                'key3',
                'value3',
            ],
        ]);
        const targetMap = new Map([
            [
                'key1',
                'updatedValue1',
            ],
            [
                'key2',
                'value2',
            ],
            [
                'key4',
                'value4',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual(['key4']);
        expect(result.updated).toEqual(['key1']);
        expect(result.deleted).toEqual(['key3']);
    });

    it('should handle identical maps', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
        const targetMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual([]);
        expect(result.deleted).toEqual([]);
    });

    it('should handle empty original map', () => {
        const originalMap = new Map();
        const targetMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([
            'key1',
            'key2',
        ]);
        expect(result.updated).toEqual([]);
        expect(result.deleted).toEqual([]);
    });

    it('should handle empty target map', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
        const targetMap = new Map();

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual([]);
        expect(result.deleted).toEqual([
            'key1',
            'key2',
        ]);
    });

    it('should handle both empty maps', () => {
        const originalMap = new Map();
        const targetMap = new Map();

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual([]);
        expect(result.deleted).toEqual([]);
    });

    it('should work with different value types', () => {
        const originalMap = new Map<string, string | number | boolean>([
            [
                'key1',
                'string',
            ],
            [
                'key2',
                42,
            ],
            [
                'key3',
                true,
            ],
        ]);
        const targetMap = new Map<string, string | number | boolean>([
            [
                'key1',
                'updatedString',
            ],
            [
                'key2',
                42,
            ],
            [
                'key3',
                false,
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual([
            'key1',
            'key3',
        ]);
        expect(result.deleted).toEqual([]);
    });

    it('should work with different key types', () => {
        const originalMap = new Map<number | string | boolean, string>([
            [
                1,
                'value1',
            ],
            [
                'string',
                'value2',
            ],
            [
                true,
                'value3',
            ],
        ]);

        const targetMap = new Map<number | string | boolean, string>([
            [
                1,
                'updatedValue1',
            ],
            [
                'string',
                'value2',
            ],
            [
                false,
                'value4',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([false]);
        expect(result.updated).toEqual([1]);
        expect(result.deleted).toEqual([true]);
    });

    it('should handle undefined values', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                undefined,
            ],
        ]);
        const targetMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'defined',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual(['key2']);
        expect(result.deleted).toEqual([]);
    });

    it('should handle null values', () => {
        const originalMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                null,
            ],
        ]);
        const targetMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'notNull',
            ],
        ]);

        const result = findMapsDifferences(originalMap, targetMap);

        expect(result.added).toEqual([]);
        expect(result.updated).toEqual(['key2']);
        expect(result.deleted).toEqual([]);
    });
});
