import {
    describe,
    expect,
    it,
} from 'vitest';

import { mapMapValues } from './mapMapValues';

describe('mapMapValues', () => {
    it('should transform all values in the map using the callback function', () => {
        const originalMap = new Map<string, number>([
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

        const result = mapMapValues(originalMap, (value) => value * 2);

        expect(result.size).toBe(3);
        expect(result.get('a')).toBe(2);
        expect(result.get('b')).toBe(4);
        expect(result.get('c')).toBe(6);
    });

    it('should pass both value and key to the callback function', () => {
        const originalMap = new Map<string, number>([
            [
                'x',
                10,
            ],
            [
                'y',
                20,
            ],
        ]);

        const result = mapMapValues(originalMap, (value, key) => `${key}:${value}`);

        expect(result.get('x')).toBe('x:10');
        expect(result.get('y')).toBe('y:20');
    });

    it('should not modify the original map', () => {
        const originalMap = new Map<string, number>([
            [
                'a',
                1,
            ],
            [
                'b',
                2,
            ],
        ]);

        const originalEntries = Array.from(originalMap.entries());

        mapMapValues(originalMap, (value) => value * 10);

        expect(Array.from(originalMap.entries())).toEqual(originalEntries);
    });

    it('should return an empty map when given an empty map', () => {
        const originalMap = new Map<string, number>();
        const result = mapMapValues(originalMap, (value) => value * 2);

        expect(result.size).toBe(0);
        expect(Array.from(result.entries())).toEqual([]);
    });

    it('should work with different value types', () => {
        const originalMap = new Map<string, string>([
            [
                'a',
                'hello',
            ],
            [
                'b',
                'world',
            ],
        ]);

        const result = mapMapValues(originalMap, (value) => value.toUpperCase());

        expect(result.get('a')).toBe('HELLO');
        expect(result.get('b')).toBe('WORLD');
    });

    it('should work with different key types', () => {
        const originalMap = new Map<number, string>([
            [
                1,
                'one',
            ],
            [
                2,
                'two',
            ],
        ]);

        const result = mapMapValues(originalMap, (value, key) => `${key}-${value}`);

        expect(result.get(1)).toBe('1-one');
        expect(result.get(2)).toBe('2-two');
    });

    it('should work with object keys', () => {
        const key1 = { id: 1 };
        const key2 = { id: 2 };
        const originalMap = new Map<object, number>([
            [
                key1,
                100,
            ],
            [
                key2,
                200,
            ],
        ]);

        const result = mapMapValues(originalMap, (value) => value / 10);

        expect(result.get(key1)).toBe(10);
        expect(result.get(key2)).toBe(20);
    });

    it('should work with complex transformation functions', () => {
        const originalMap = new Map<string, { count: number; name: string }>([
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

        const result = mapMapValues(originalMap, (value, key) => {
            return {
                id: key,
                displayName: `${value.name} (${value.count})`,
            };
        });

        expect(result.get('user1')).toEqual({
            id: 'user1',
            displayName: 'Alice (5)',
        });
        expect(result.get('user2')).toEqual({
            id: 'user2',
            displayName: 'Bob (3)',
        });
    });

    it('should handle callback that returns different types', () => {
        const originalMap = new Map<string, number>([
            [
                'a',
                1,
            ],
            [
                'b',
                2,
            ],
        ]);

        const result = mapMapValues(originalMap, (value) => value > 1);

        expect(result.get('a')).toBe(false);
        expect(result.get('b')).toBe(true);
    });

    it('should preserve map order', () => {
        const originalMap = new Map<string, number>([
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

        const result = mapMapValues(originalMap, (value) => value * 2);

        const resultKeys = Array.from(result.keys());
        const originalKeys = Array.from(originalMap.keys());

        expect(resultKeys).toEqual(originalKeys);
    });
});
