import {
    describe,
    expect,
    it,
} from 'vitest';

import { invertObject } from './invertObject';

describe('invertObject', () => {
    it('should invert a simple object with string key-value pairs', () => {
        const input = {
            a: '1',
            b: '2',
            c: '3',
        } as const;

        const expected = {
            1: 'a',
            2: 'b',
            3: 'c',
        };

        const inverted = invertObject(input);

        expect(inverted).toEqual(expected);

        // @ts-expect-error - This should be an error because the inverted doesn't have the key 'a'
        inverted.a = '1';

        // @ts-expect-error - This should be able to assign a number to a string literal key
        inverted['2'] = 3;

        // TODO: This should be an error, but I don't know how to make it in typescript
        inverted['2'] = 'a';

        inverted['2'] = 'b';
    });

    it('should handle empty objects', () => {
        const input = {};
        const expected = {};

        expect(invertObject(input)).toEqual(expected);
    });

    it('should handle objects with duplicate values', () => {
        const input = {
            a: '1',
            b: '1',
            c: '2',
        };

        // Note: When there are duplicate values, the last key wins
        const expected = {
            1: 'b',
            2: 'c',
        };

        expect(invertObject(input)).toEqual(expected);
    });

    it('should preserve string types in the inverted object', () => {
        const input = {
            key1: 'value1',
            key2: 'value2',
        };

        const result = invertObject(input);

        // Type checking
        expect(typeof result.value1).toBe('string');
        expect(typeof result.value2).toBe('string');
    });
});
