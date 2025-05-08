import {
    describe, expect, test,
} from 'vitest';

import { getObjectEntries } from './getObjectEntries';

describe('getObjectEntries', () => {
    class TestClass {
        public constructor(public readonly prop1: unknown, public readonly prop2: unknown) {}

        public method() {
            //
        }
    }

    const testInstance = new TestClass(1, 2);

    test('native (just own properties)', () => {
        expect(getObjectEntries(testInstance)).to.eql([
            [
                'prop1',
                1,
            ],
            [
                'prop2',
                2,
            ],
        ]);
    });

    test('string enum', () => {
        enum StringEnum {
            prop1 = 'value1',
            prop2 = 'value2',
            prop3 = 'value3',
        }

        const keys = getObjectEntries(StringEnum);

        expect(keys).to.eql([
            [
                'prop1',
                'value1',
            ],
            [
                'prop2',
                'value2',
            ],
            [
                'prop3',
                'value3',
            ],
        ]);

        // typescript passes through property name types
        if (StringEnum[keys[0][0]] === StringEnum.prop1) {
            expect(StringEnum[keys[1][0]]).to.eql(StringEnum.prop2);
        }
    });
});
