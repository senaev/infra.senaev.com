import {
    describe, expect, it,
} from 'vitest';

import { isNonEmptyArray } from './isNonEmptyArray';

describe('isNonEmptyArray', () => {
    it.each([
        {
            value: [],
            expected: false,
        },
        {
            value: [1],
            expected: true,
        },
        {
            value: [
                null,
                undefined,
            ],
            expected: true,
        },
        {
            value: 'item',
            expected: false,
        },
        {
            value: { length: 1 },
            expected: false,
        },
        {
            value: null,
            expected: false,
        },
        {
            value: undefined,
            expected: false,
        },
    ])('returns $expected for $value', ({ value, expected }) => {
        expect(isNonEmptyArray(value)).toBe(expected);
    });
});
