import {
    describe,
    expect,
    it
} from 'vitest';

import { getUniqueValues } from './getUniqueValues';

const object1 = {};
const object2 = {};
const object3 = {};

const arraysSet: {
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: any[];
}[] = [
    {
        name: 'equal',
        data: [
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
        ],
        result: [
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
        ],
    },
    {
        name: 'check order',
        data: [
            '1',
            '2',
            '2',
            '2',
            '3',
            '2',
            '2',
            '4',
            '2',
            '3',
            '5',
            '3',
            '6',
            '3',
        ],
        result: [
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
        ],
    },
    {
        name: 'other order',
        data: [
            '3',
            '2',
            '2',
            '2',
            '3',
            '2',
            '2',
            '4',
            '2',
            '3',
            '5',
            '3',
            '6',
            '3',
        ],
        result: [
            '3',
            '2',
            '4',
            '5',
            '6',
        ],
    },
    {
        name: 'objects',
        data: [
            object1,
            object2,
            object3,
        ],
        result: [
            object1,
            object2,
            object3,
        ],
    },
    {
        name: 'duplicate objects',
        data: [
            object1,
            object2,
            object1,
            object2,
            object2,
            object3,
            object2,
            object1,
            object2,
        ],
        result: [
            object1,
            object2,
            object3,
        ],
    },
    {
        name: 'numbers, NaN',
        data: [
            1,
            NaN,
            1,
            NaN,
            2,
            NaN,
            1,
            NaN,
            3,
            NaN,
            1,
            NaN,
            3,
            3,
            NaN,
            4,
            NaN,
            1,
            NaN,
            5,
            4,
        ],
        result: [
            1,
            2,
            3,
            4,
            5,
        ],
    },
];

describe('array', () => {
    describe('getUniqueValues', () => {
        for (const {
            data, result, name,
        } of arraysSet) {
            it(name, () => {
                expect(getUniqueValues(data)).to.eql(result);
            });
        }
    });
});
