import {
    describe, expect, it,
} from 'vitest';

import { forOwn } from './forOwn';

const a = 1;
const b = 2;
const c = 4;

describe('forOwn', () => {
    it('should use only own property', () => {
        let sum = 0;

        const obj = Object.assign(Object.create({ c }), {
            a,
            b,
        });
        expect(obj.a).to.eql(a);
        expect(obj.b).to.eql(b);
        forOwn(obj, (elem) => (sum += elem));
        expect(sum).to.eql(b + a);
    });

    it('should correctly pass all elem, key and object in callback', () => {
        const testObj = {
            a,
            b,
            c,
        };
        forOwn(testObj, (elem, key, obj) => {
            if (obj[key] !== elem) {
                throw new Error('element has not been passed');
            }
        });
    });

    it('should not throw for Object with null as __proto__', () => {
        const testObj = Object.create(null);

        Object.assign(testObj, {
            a,
            b,
            c,
        });

        expect(() => forOwn(testObj, () => {
            // not empty
        })).not.to.throw(Error);
    });

    it('should iterate via all props on Object with null as __proto__', () => {
        const testObj = Object.create(null);

        Object.assign(testObj, {
            a,
            b,
            c,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const iteratedEntries: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saver = (value: any, key: any) => {
            iteratedEntries.push([
                value,
                key,
            ]);
        };

        forOwn(testObj, saver);

        expect(iteratedEntries).to.have.length(3);
        expect(iteratedEntries).to.deep.include.all.members([
            [
                a,
                'a',
            ],
            [
                b,
                'b',
            ],
            [
                c,
                'c',
            ],
        ]);
    });

    it('should iterate via all props on Object with redeclared hasOwnProperty method', () => {
        const testObj = {
            a,
            b,
            c,
            hasOwnProperty: () => false,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const iteratedEntries: any[] = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saver = (value: any, key: any) => {
            iteratedEntries.push([
                value,
                key,
            ]);
        };

        forOwn(testObj, saver);

        expect(iteratedEntries).to.have.length(4);
        expect(iteratedEntries).to.deep.include.all.members([
            [
                a,
                'a',
            ],
            [
                b,
                'b',
            ],
            [
                c,
                'c',
            ],
            [
                testObj.hasOwnProperty,
                'hasOwnProperty',
            ],
        ]);
    });
});
