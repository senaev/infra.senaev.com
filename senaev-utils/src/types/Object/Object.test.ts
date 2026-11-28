import {
    describe, expect, test,
} from 'vitest';

import { assertObject, isObject } from './Object';

describe('isObject', () => {
    test('accepts objects and functions', () => {
        expect(isObject({ foo: 'bar' })).toBe(true);
        expect(isObject(() => undefined)).toBe(true);
    });

    test('rejects arrays', () => {
        expect(isObject([])).toBe(false);
        expect(isObject([1])).toBe(false);
    });

    test('rejects null and primitives', () => {
        expect(isObject(null)).toBe(false);
        expect(isObject(undefined)).toBe(false);
        expect(isObject('foobar')).toBe(false);
    });
});

// `isObjectOrArray` itself is covered by ./isObjectOrArray.spec.ts.
describe('assertObject', () => {
    const testCases = [
        {
            input: {},
            output: true,
        },
        {
            input: { foo: 'bar' },
            output: true,
        },
        {
            input: () => {
                /**/
            },
            output: true,
        },
        {
            input: undefined,
            output: false,
        },
        {
            input: null,
            output: false,
        },
        {
            input: 1234,
            output: false,
        },
        {
            input: 'foobar',
            output: false,
        },
    ];

    testCases.forEach(({ input, output }) => {
        test(`assertObject(${JSON.stringify(input)}) ${output ? 'passes' : 'throws'}`, () => {
            if (output) {
                expect(() => assertObject(input)).to.not.throw();
            } else {
                expect(() => assertObject(input)).to.throw();
            }
        });
    });
});
