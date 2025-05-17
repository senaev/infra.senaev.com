import {
    describe,
    expect,
    it,
} from 'vitest';

import { mapGetOrSet } from './mapGetOrSet';

describe('mapGetOrSet', () => {
    it('should add a new key-value pair when the key does not exist', () => {
        const map = new Map<string, number>();
        const value = mapGetOrSet(map, 'test', 42);

        expect(map.has('test')).toBe(true);
        expect(map.get('test')).toBe(42);
        expect(value).toBe(42);
    });

    it('should not modify the map when the key already exists', () => {
        const map = new Map<string, number>();
        map.set('test', 42);

        const value = mapGetOrSet(map, 'test', 100);

        expect(map.get('test')).toBe(42);
        expect(value).toBe(42);
    });

    it('should work with different types of keys and values', () => {
        const map = new Map<number, string>();
        const value = mapGetOrSet(map, 1, 'hello');

        expect(map.has(1)).toBe(true);
        expect(map.get(1)).toBe('hello');
        expect(value).toBe('hello');
    });

    it('should work with object keys', () => {
        const map = new Map<object, string>();
        const key = { id: 1 };
        const value = mapGetOrSet(map, key, 'object value');

        expect(map.has(key)).toBe(true);
        expect(map.get(key)).toBe('object value');
        expect(value).toBe('object value');
    });
});
