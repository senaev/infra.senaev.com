import {
    describe, expect, test,
} from 'vitest';

import { assertObject } from './Object';

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
