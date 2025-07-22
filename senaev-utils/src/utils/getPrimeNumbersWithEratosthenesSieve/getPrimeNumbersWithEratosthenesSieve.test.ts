import {
    describe, expect, it,
} from 'vitest';

import { getPrimeNumbersWithEratosthenesSieve } from './getPrimeNumbersWithEratosthenesSieve';

describe('getPrimeNumbersWithEratosthenesSieve', () => {
    it('get primes', () => {
        expect(getPrimeNumbersWithEratosthenesSieve(0)).toStrictEqual([]);
        expect(getPrimeNumbersWithEratosthenesSieve(1)).toStrictEqual([]);
        expect(getPrimeNumbersWithEratosthenesSieve(2)).toStrictEqual([2]);
        expect(getPrimeNumbersWithEratosthenesSieve(3)).toStrictEqual([
            2,
            3,
        ]);
        expect(getPrimeNumbersWithEratosthenesSieve(7)).toStrictEqual([
            2,
            3,
            5,
            7,
        ]);
        expect(getPrimeNumbersWithEratosthenesSieve(100)).toStrictEqual([
            2,
            3,
            5,
            7,
            11,
            13,
            17,
            19,
            23,
            29,
            31,
            37,
            41,
            43,
            47,
            53,
            59,
            61,
            67,
            71,
            73,
            79,
            83,
            89,
            97,
        ]);

        const primesOf700_000 = getPrimeNumbersWithEratosthenesSieve(700_000);

        expect(primesOf700_000.length).toBe(56543);
    });
});
