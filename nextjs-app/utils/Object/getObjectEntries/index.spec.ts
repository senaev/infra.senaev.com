import {
    describe, expect, it,
} from 'vitest';

import { getObjectEntries } from './';

describe('getObjectEntries', () => {
    class TestClass {
        public readonly prop1: unknown;

        public readonly prop2: unknown;

        public constructor(prop1: unknown, prop2: unknown) {
            this.prop1 = prop1;
            this.prop2 = prop2;
        }

        public method() {
            return this.prop1;
        }
    }

    const testInstance = new TestClass(1, 2);

    it('native (just own properties)', () => {
        expect(getObjectEntries(testInstance)).toStrictEqual([
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

    it('string enum', () => {
        enum StringEnum {
            prop1 = 'value1',
            prop2 = 'value2',
            prop3 = 'value3',
        }

        const keys = getObjectEntries(StringEnum);

        expect(keys).toStrictEqual([
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

        if (StringEnum[keys[0]![0]] === StringEnum.prop1) {
            expect(StringEnum[keys[1]![0]]).toStrictEqual(StringEnum.prop2);
        }
    });
});
