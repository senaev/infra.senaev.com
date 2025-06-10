import {
    describe, expect, it,
} from 'vitest';

import { filterObject } from './filterObject';

describe('filterObject', () => {
    const object = {
        hello: 'world',
        first: 1,
        second: 2,
        third: 3,
        foo: 'bar',
    };

    const testCases = [
        {
            name: 'should remain numbers',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter: (value: any) => typeof value === 'number',
            result: {
                first: 1,
                second: 2,
                third: 3,
            },
        },
        {
            name: 'should remain first and second',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter: (_value: any, key: string) => key === 'first' || key === 'second',
            result: {
                first: 1,
                second: 2,
            },
        },
        {
            name: 'should remove all props',
            filter: () => false,
            result: {},
        },
        {
            name: 'should remain all props',
            filter: () => true,
            result: object,
        },
    ];

    testCases.forEach(({
        name, filter, result,
    }) => {
        it(name, () => {
            expect(filterObject(object, filter)).to.eql(result);
        });
    });
});
