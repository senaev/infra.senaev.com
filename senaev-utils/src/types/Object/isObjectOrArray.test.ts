import {
    describe,
    expect,
    it,
} from 'vitest';

import { isObjectOrArray } from './Object';

describe('isObjectOrArray', () => {
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
            input: [1],
            output: true,
        },
        {
            input() {
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
        it(`isObjectOrArray(${JSON.stringify(input)}) -> ${String(output)}`, () => {
            expect(isObjectOrArray(input)).toEqual(output);
        });
    });
});
