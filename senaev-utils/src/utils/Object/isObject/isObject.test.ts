import {
    describe, expect, test,
} from 'vitest';

import { isObject } from './isObject';

describe('isObject', () => {
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
        test(`isObject(${JSON.stringify(input)}) -> ${output}`, () => {
            expect(isObject(input)).to.eql(output);
        });
    });
});
