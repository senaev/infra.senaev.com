import {
    describe,
    expect,
    it,
} from 'vitest';

import { createArray } from './createArray';

describe('createArray', () => {
    it('should create an array of specified length with the same value', () => {
        const result = createArray(3, 'a');

        expect(result).toEqual([
            'a',
            'a',
            'a',
        ]);
    });

    it('should work with numbers', () => {
        const result = createArray(4, 42);

        expect(result).toEqual([
            42,
            42,
            42,
            42,
        ]);
    });

    it('should work with objects', () => {
        const obj = { id: 1 };
        const result = createArray(2, obj);

        expect(result).toEqual([
            obj,
            obj,
        ]);
    });

    it('should return empty array when length is 0', () => {
        const result = createArray(0, 'test');

        expect(result).toEqual([]);
    });

    it('can work without second param', () => {
        const result = createArray(2);

        expect(result).toEqual([
            undefined,
            undefined,
        ]);
    });
});
