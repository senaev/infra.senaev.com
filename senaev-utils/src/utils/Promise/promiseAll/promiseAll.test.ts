import {
    describe,
    expect,
    it,
} from 'vitest';

import { promiseAll } from './promiseAll';

describe('promiseAll', () => {
    it('should preserve exact types of input promises', async () => {
        // Test with mixed promise types
        const stringPromise = Promise.resolve('hello');
        const numberPromise = Promise.resolve(42);
        const booleanPromise = Promise.resolve(true);
        const objectPromise = Promise.resolve({ key: 'value' });

        const result = await promiseAll([
            stringPromise,
            numberPromise,
            booleanPromise,
            objectPromise,
        ] as const);

        // Type checking: result should be [string, number, boolean, { key: string }]
        expect(result[0]).toBe('hello');
        expect(result[1]).toBe(42);
        expect(result[2]).toBe(true);
        expect(result[3]).toEqual({ key: 'value' });

        // Verify the exact types are preserved
        const [
            str,
            num,
            bool,
            obj,
        ] = result;

        // These assignments should work without type errors
        const stringVar: string = str;
        const numberVar: number = num;
        const booleanVar: boolean = bool;
        const objectVar: { key: string } = obj;

        expect(stringVar).toBe('hello');
        expect(numberVar).toBe(42);
        expect(booleanVar).toBe(true);
        expect(objectVar).toEqual({ key: 'value' });
    });

    it('should work with empty array', async () => {
        const result = await promiseAll([]);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
    });

    it('should work with single promise', async () => {
        const singlePromise = Promise.resolve('single');
        const result = await promiseAll([singlePromise]);

        expect(result).toEqual(['single']);
        expect(result[0]).toBe('single');

        // Type should be preserved as [string]
        const firstElement: string = result[0];

        expect(firstElement).toBe('single');
    });

    it('should work with rejected promises', async () => {
        const successPromise = Promise.resolve('success');
        const errorPromise = Promise.reject(new Error('test error'));

        await expect(promiseAll([
            successPromise,
            errorPromise,
        ])).rejects.toThrow('test error');
    });

    it('should work with mixed resolved and rejected promises', async () => {
        const successPromise1 = Promise.resolve('first');
        const successPromise2 = Promise.resolve(123);
        const errorPromise = Promise.reject(new Error('mixed error'));

        await expect(promiseAll([
            successPromise1,
            errorPromise,
            successPromise2,
        ])).rejects.toThrow('mixed error');
    });
});
