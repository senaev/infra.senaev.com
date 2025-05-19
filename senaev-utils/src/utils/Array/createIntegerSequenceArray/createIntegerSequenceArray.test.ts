import {
    describe,
    expect,
    it,
} from 'vitest';

import { createIntegerSequenceArray } from './createIntegerSequenceArray';

describe('createIntegerSequenceArray', () => {
    it('should create a sequence from start to end inclusive', () => {
        const result = createIntegerSequenceArray(1, 5);
        expect(result).toEqual([
            1,
            2,
            3,
            4,
            5,
        ]);
    });

    it('should work with negative numbers', () => {
        const result = createIntegerSequenceArray(-2, 2);
        expect(result).toEqual([
            -2,
            -1,
            0,
            1,
            2,
        ]);
    });

    it('should return single element array when start equals end', () => {
        const result = createIntegerSequenceArray(3, 3);
        expect(result).toEqual([3]);
    });

    it('should work with zero', () => {
        const result = createIntegerSequenceArray(0, 3);
        expect(result).toEqual([
            0,
            1,
            2,
            3,
        ]);
    });
});
