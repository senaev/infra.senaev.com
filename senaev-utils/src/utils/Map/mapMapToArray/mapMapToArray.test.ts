import {
    describe,
    expect,
    it,
} from 'vitest';

import { mapMapToArray } from './mapMapToArray';

describe('mapMapToArray', () => {
    it('should transform map entries to array using callback function', () => {
        const map = new Map<string, number>([
            [
                'a',
                1,
            ],
            [
                'b',
                2,
            ],
            [
                'c',
                3,
            ],
        ]);

        const result = mapMapToArray(map, (value) => value * 2);

        expect(result).toEqual([
            2,
            4,
            6,
        ]);
    });

    it('should pass both value and key to the callback function', () => {
        const map = new Map<string, number>([
            [
                'x',
                10,
            ],
            [
                'y',
                20,
            ],
        ]);

        const result = mapMapToArray(map, (value, key) => `${key}:${value}`);

        expect(result).toEqual([
            'x:10',
            'y:20',
        ]);
    });

    it('should not modify the original map', () => {
        const map = new Map<string, number>([
            [
                'a',
                1,
            ],
            [
                'b',
                2,
            ],
        ]);

        const originalEntries = Array.from(map.entries());

        mapMapToArray(map, (value) => value * 10);

        expect(Array.from(map.entries())).toEqual(originalEntries);
    });

    it('should return an empty array when given an empty map', () => {
        const map = new Map<string, number>();
        const result = mapMapToArray(map, (value) => value * 2);

        expect(result).toEqual([]);
    });

    it('should work with different value types', () => {
        const map = new Map<string, string>([
            [
                'a',
                'hello',
            ],
            [
                'b',
                'world',
            ],
        ]);

        const result = mapMapToArray(map, (value) => value.toUpperCase());

        expect(result).toEqual([
            'HELLO',
            'WORLD',
        ]);
    });

    it('should work with different key types', () => {
        const map = new Map<number, string>([
            [
                1,
                'one',
            ],
            [
                2,
                'two',
            ],
        ]);

        const result = mapMapToArray(map, (value, key) => `${key}-${value}`);

        expect(result).toEqual([
            '1-one',
            '2-two',
        ]);
    });

    it('should work with object keys', () => {
        const key1 = { id: 1 };
        const key2 = { id: 2 };
        const map = new Map<object, number>([
            [
                key1,
                100,
            ],
            [
                key2,
                200,
            ],
        ]);

        const result = mapMapToArray(map, (value) => value / 10);

        expect(result).toEqual([
            10,
            20,
        ]);
    });

    it('should work with complex transformation functions', () => {
        const map = new Map<string, { count: number; name: string }>([
            [
                'user1',
                {
                    count: 5,
                    name: 'Alice',
                },
            ],
            [
                'user2',
                {
                    count: 3,
                    name: 'Bob',
                },
            ],
        ]);

        const result = mapMapToArray(map, (value, key) => {
            return {
                id: key,
                displayName: `${value.name} (${value.count})`,
            };
        });

        expect(result).toEqual([
            {
                id: 'user1',
                displayName: 'Alice (5)',
            },
            {
                id: 'user2',
                displayName: 'Bob (3)',
            },
        ]);
    });

    it('should handle callback that returns different types', () => {
        const map = new Map<string, number>([
            [
                'a',
                1,
            ],
            [
                'b',
                2,
            ],
        ]);

        const result = mapMapToArray(map, (value) => value > 1);

        expect(result).toEqual([
            false,
            true,
        ]);
    });

    it('should preserve map insertion order', () => {
        const map = new Map<string, number>([
            [
                'z',
                1,
            ],
            [
                'a',
                2,
            ],
            [
                'm',
                3,
            ],
        ]);

        const result = mapMapToArray(map, (value) => value * 2);

        expect(result).toEqual([
            2,
            4,
            6,
        ]);
    });

    it('should work with mixed key and value types', () => {
        const map = new Map<number | string, boolean | string>([
            [
                1,
                true,
            ],
            [
                'test',
                'hello',
            ],
            [
                42,
                false,
            ],
        ]);

        const result = mapMapToArray(map, (value, key) => `${key}=${value}`);

        expect(result).toEqual([
            '1=true',
            'test=hello',
            '42=false',
        ]);
    });

    it('should handle callback that uses only the value parameter', () => {
        const map = new Map<string, number>([
            [
                'ignored',
                5,
            ],
            [
                'also_ignored',
                10,
            ],
        ]);

        const result = mapMapToArray(map, (value) => value * 3);

        expect(result).toEqual([
            15,
            30,
        ]);
    });

    it('should handle callback that uses only the key parameter', () => {
        const map = new Map<string, number>([
            [
                'first',
                999,
            ],
            [
                'second',
                888,
            ],
        ]);

        const result = mapMapToArray(map, (_, key) => key.length);

        expect(result).toEqual([
            5,
            6,
        ]);
    });

    it('should work with null and undefined values', () => {
        const map = new Map<string, string | null | undefined>([
            [
                'a',
                'hello',
            ],
            [
                'b',
                null,
            ],
            [
                'c',
                undefined,
            ],
        ]);

        const result = mapMapToArray(map, (value, key) => `${key}:${value}`);

        expect(result).toEqual([
            'a:hello',
            'b:null',
            'c:undefined',
        ]);
    });
});
