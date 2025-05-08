import {
    describe,
    expect,
    it,
} from 'vitest';

import type { RangeTuple } from '../../../types/RangeTuple';

import { mapRange } from './mapRange';

describe('mapRange', () => {
    it('should map number range to number range', () => {
        const input: RangeTuple<number> = [
            1,
            5,
        ];
        const result = mapRange(input, (n) => n * 2);
        expect(result).toEqual([
            2,
            10,
        ]);
    });

    it('should map number range to string range', () => {
        const input: RangeTuple<number> = [
            1,
            5,
        ];
        const result = mapRange(input, (n) => n.toString());
        expect(result).toEqual([
            '1',
            '5',
        ]);
    });

    it('should provide correct index parameter', () => {
        const input: RangeTuple<number> = [
            1,
            5,
        ];
        const indices: number[] = [];
        mapRange(input, (n, index) => {
            indices.push(index);
            return n;
        });
        expect(indices).toEqual([
            0,
            1,
        ]);
    });

    it('should handle string range input', () => {
        const input: RangeTuple<string> = [
            'a',
            'z',
        ];
        const result = mapRange(input, (str) => str.toUpperCase());
        expect(result).toEqual([
            'A',
            'Z',
        ]);
    });

    it('should handle complex transformations', () => {
        const input: RangeTuple<number> = [
            1,
            2,
        ];
        const result = mapRange(input, (n, i) => {
            return {
                value: n,
                isEnd: i === 1,
            };
        });
        expect(result).toEqual([
            {
                value: 1,
                isEnd: false,
            },
            {
                value: 2,
                isEnd: true,
            },
        ]);
    });

    it('should preserve tuple length', () => {
        const input: RangeTuple<number> = [
            1,
            5,
        ];
        const result = mapRange(input, (n) => n * 2);
        expect(result.length).toBe(2);
    });
});
