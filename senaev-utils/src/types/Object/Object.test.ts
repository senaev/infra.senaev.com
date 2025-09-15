import {
    describe, expect, test,
} from 'vitest';

import { assertObject, isObject } from './Object';

describe('Object', () => {
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
            const isObjectResult = isObject(input);

            expect(isObjectResult).to.eql(output);

            if (isObjectResult) {
                expect(() => assertObject(input)).to.not.throw();
            } else {
                expect(() => assertObject(input)).to.throw();
            }
        });
    });
});
