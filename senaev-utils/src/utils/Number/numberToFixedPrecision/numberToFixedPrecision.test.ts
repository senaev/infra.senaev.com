import {
    describe,
    expect,
    it,
} from 'vitest';

import { numberToFixedPrecision } from './numberToFixedPrecision';

describe('numberToFixedPrecision', () => {
    it('should normally convert', () => {
        const testCases = [
            {
                input: 1000000,
                expected: '1000000',
            },
            {
                input: 100000,
                expected: '100000',
            },
            {
                input: 10000,
                expected: '10000',
            },
            {
                input: 1000,
                expected: '1000.0',
            },
            {
                input: 100,
                expected: '100.00',
            },
            {
                input: 10,
                expected: '10.000',
            },
            {
                input: 1,
                expected: '1.0000',
            },
            {
                input: 0.1,
                expected: '0.10000',
            },
            {
                input: 0.01,
                expected: '0.010000',
            },
            {
                input: 0.001,
                expected: '0.0010000',
            },
            {
                input: 0.0001,
                expected: '0.00010000',
            },
            {
                input: 0.0001,
                expected: '0.00010000',
            },
            {
                input: 0.0001,
                expected: '0.00010000',
            },
        ];

        testCases.forEach(({ input, expected }) => {
            expect(numberToFixedPrecision(input)).toBe(expected);
        });
    });

    it('should handle numbers with many decimal places correctly', () => {
        const testCases = [
            {
                input: 3.141592653589793,
                expected: '3.1416',
            },
            {
                input: 2.718281828459045,
                expected: '2.7183',
            },
            {
                input: 1.4142135623730951,
                expected: '1.4142',
            },
        ];

        testCases.forEach(({ input, expected }) => {
            expect(numberToFixedPrecision(input)).toBe(expected);
        });
    });

    it('consider precision level', () => {
        const testCases = [
            {
                input: 3.141592653589793,
                expected2: '3.14',
                expected5: '3.14159',
            },
            {
                input: 2.718281828459045,
                expected2: '2.72',
                expected5: '2.71828',
            },
            {
                input: 1.4142135623730951,
                expected2: '1.41',
                expected5: '1.41421',
            },
        ];

        testCases.forEach(({ input, expected2 }) => {
            expect(numberToFixedPrecision(input, 2)).toBe(expected2);
        });

        testCases.forEach(({ input, expected5 }) => {
            expect(numberToFixedPrecision(input, 5)).toBe(expected5);
        });
    });

    it('works with negatives', () => {
        const testCases = [
            {
                input: -1000000,
                expected: '-1000000',
            },
            {
                input: -100000,
                expected: '-100000',
            },
            {
                input: -10000,
                expected: '-10000',
            },
            {
                input: -1000,
                expected: '-1000.0',
            },
            {
                input: -100,
                expected: '-100.00',
            },
            {
                input: -10,
                expected: '-10.000',
            },
            {
                input: -1,
                expected: '-1.0000',
            },
            {
                input: -0.1,
                expected: '-0.10000',
            },
            {
                input: -0.01,
                expected: '-0.010000',
            },
            {
                input: -0.001,
                expected: '-0.0010000',
            },
            {
                input: -0.0001,
                expected: '-0.00010000',
            },
            {
                input: -0.0001,
                expected: '-0.00010000',
            },
            {
                input: -0.0001,
                expected: '-0.00010000',
            },
        ];

        testCases.forEach(({ input, expected }) => {
            expect(numberToFixedPrecision(input)).toBe(expected);
        });
    });
});
