import {
    describe, expect, it,
} from 'vitest';

import { separateArray } from './separateArray';

describe('array', () => {
    describe('separate', () => {
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
    });
});
