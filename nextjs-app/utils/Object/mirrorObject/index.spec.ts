import {
    describe,
    expect,
    it,
} from 'vitest';

import { mirrorObject } from './';

describe('mirrorObject', () => {
    const testCases: Record<string, unknown>[][] = [
        [
            {},
            {},
        ],
        [
            { foo: 1 },
            { foo: 'foo' },
        ],
        [
            {
                foo: 4,
                bar: 7,
            },
            {
                foo: 'foo',
                bar: 'bar',
            },
        ],
    ];

    testCases.forEach(([
        obj,
        expectedResult,
    ]) => {
        it(`${JSON.stringify(obj)} -> ${String(expectedResult)}`, () => {
            expect(mirrorObject(obj!)).toEqual(expectedResult);
        });
    });
});
