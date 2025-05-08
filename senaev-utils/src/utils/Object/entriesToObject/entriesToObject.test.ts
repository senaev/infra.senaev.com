import {
    describe,
    expect, test,
} from 'vitest';

import { getObjectEntries } from '../getObjectEntries/getObjectEntries';

import { entriesToObject } from './entriesToObject';

describe('entriesToObject', () => {
    test('normal logic', () => {
        expect(entriesToObject([
            [
                'prop1',
                1,
            ],
            [
                'prop2',
                2,
            ],
        ])).to.eql({
            prop1: 1,
            prop2: 2,
        });
    });

    test('last value from the same object property names', () => {
        const object = entriesToObject([
            [
                'prop1',
                1,
            ],
            [
                'prop2',
                2,
            ],
            [
                'prop2',
                22,
            ],
            [
                'prop3',
                3,
            ],
            [
                'prop2',
                222,
            ],
        ]);

        expect(object).to.eql({
            prop1: 1,
            prop2: 222,
            prop3: 3,
        });
    });

    test('reverse logic', () => {
        class TestClass {
            constructor(public readonly prop1: unknown, public readonly prop2: unknown) {}

            public method() {
                //
            }
        }

        const testInstance = new TestClass(1, 2);

        expect(entriesToObject(getObjectEntries(testInstance))).to.eql({
            prop1: 1,
            prop2: 2,
        });
    });
});
