import {
    describe, expect, it,
} from 'vitest';

import { separateArray } from './separateArray';

describe('separateArray', () => {
    it('empty', () => {
        expect(separateArray([], () => true)).to.eql([
            [],
            [],
        ]);
    });

    it('sequence', () => {
        const [
            numbers,
            strings,
        ] = separateArray([
            0,
            '1',
            2,
            '3',
            4,
            '5',
            6,
            '7',
            8,
            '9',
        ], (val) => typeof val === 'number');

        expect(numbers).to.eql([
            0,
            2,
            4,
            6,
            8,
        ]);
        expect(strings).to.eql([
            '1',
            '3',
            '5',
            '7',
            '9',
        ]);
    });

    it('works with Set', () => {
        const [
            even,
            odd,
        ] = separateArray(new Set([
            1,
            2,
            3,
            4,
            5,
        ]), (val) => val % 2 === 0);

        expect(even).to.eql([
            2,
            4,
        ]);
        expect(odd).to.eql([
            1,
            3,
            5,
        ]);
    });

    it('works with Map', () => {
        const map = new Map([
            [
                'a',
                1,
            ],
            [
                'b',
                2,
            ],
            [
                'c',
                3,
            ],
        ]);
        const [
            evenValues,
            oddValues,
        ] = separateArray(map.values(), (val) => val % 2 === 0);

        expect(evenValues).to.eql([2]);
        expect(oddValues).to.eql([
            1,
            3,
        ]);
    });

    it('works with String', () => {
        const [
            vowels,
            consonants,
        ] = separateArray('hello', (char) => 'aeiou'.includes(char));

        expect(vowels).to.eql([
            'e',
            'o',
        ]);
        expect(consonants).to.eql([
            'h',
            'l',
            'l',
        ]);
    });
});
