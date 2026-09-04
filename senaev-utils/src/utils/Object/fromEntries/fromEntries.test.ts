import {
    describe,
    expect, test,
} from 'vitest';

import { getObjectEntries } from '../getObjectEntries/getObjectEntries';

import { fromEntries } from './fromEntries';

describe('fromEntries', () => {
    test('normal logic', () => {
        expect(fromEntries([
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
        const object = fromEntries([
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
            public constructor(public readonly prop1: unknown, public readonly prop2: unknown) {}

            // eslint-disable-next-line class-methods-use-this
            public method() {
                //
            }
        }

        const testInstance = new TestClass(1, 2);

        expect(fromEntries(getObjectEntries(testInstance))).to.eql({
            prop1: 1,
            prop2: 2,
        });
    });
});
