import {
    describe, expect, it,
} from 'vitest';

import { hasOwnProperty } from './hasOwnProperty';

describe('hasOwnProperty', () => {
    it('should return true if checks own property', () => {
        expect(hasOwnProperty({ a: 1 }, 'a')).to.equal(true);
    });

    it('should return false if checks proto\'s property', () => {
        expect(hasOwnProperty({ a: 1 }, 'toString')).to.equal(false);
    });

    it('should return true if checks own property in object without proto', () => {
        const obj = Object.create(null);

        obj.a = 1;

        expect(hasOwnProperty(obj, 'a')).to.equal(true);
    });

    it('should return true if checks own property in object with redeclared hasOwnProperty method', () => {
        const obj = {
            a: 1,
            hasOwnProperty: () => false,
        };

        expect(hasOwnProperty(obj, 'a')).to.equal(true);
    });
});
