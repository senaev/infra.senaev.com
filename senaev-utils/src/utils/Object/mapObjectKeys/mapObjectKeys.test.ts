import {
    describe,
    expect,
    test,
} from 'vitest';

import { getObjectEntries } from '../getObjectEntries/getObjectEntries';

import { mapObjectKeys } from './mapObjectKeys';

describe('mapObjectKeys', () => {
    test('empty object', () => {
        expect(mapObjectKeys({}, () => '123321123')).to.eql({});
    });

    test('passing key and value params', () => {
        const initialObject = {
            1: 4,
            2: 5,
            3: 6,
        };

        expect(mapObjectKeys(initialObject, (key, value) => `propertyName_${key}_${value}`)).to.eql({
            propertyName_1_4: 4,
            propertyName_2_5: 5,
            propertyName_3_6: 6,
        });
    });

    test('use last iterable value when keys are the same', () => {
        const initialObject = {
            1: 4,
            2: 5,
            3: 6,
        };

        const entries = getObjectEntries(initialObject);
        const lastIterableValue = entries[entries.length - 1][1];

        expect(mapObjectKeys(initialObject, () => 'propertyName')).to.eql({
            propertyName: lastIterableValue,
        });
    });
});
