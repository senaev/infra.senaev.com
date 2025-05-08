import {
    describe, expect, it,
} from 'vitest';

import { MinMaxHeap } from './MinMaxHeap';

describe('MinMaxHeap', () => {
    it('add correctly', () => {
        const heap = new MinMaxHeap((a: number, b: number) => a - b);

        expect(heap.getFirst()).toStrictEqual(undefined);
        expect(heap.getSize()).toStrictEqual(0);

        heap.push([
            8,
            '-8',
        ]);
        expect(heap.getSize()).toStrictEqual(1);
        heap.push([
            1,
            1,
        ]);
        heap.push([
            4,
            4,
        ]);
        heap.push([
            -1,
            -1,
        ]);
        heap.push([
            6,
            6,
        ]);
        heap.push([
            3,
            3,
        ]);
        heap.push([
            3000,
            3000,
        ]);
        heap.push([
            5,
            5,
        ]);

        expect(heap.getSize()).toStrictEqual(8);

        expect(heap.pop()).toStrictEqual([
            -1,
            -1,
        ]);
        expect(heap.pop()).toStrictEqual([
            1,
            1,
        ]);
        expect(heap.pop()).toStrictEqual([
            3,
            3,
        ]);

        expect(heap.getSize()).toStrictEqual(5);
        expect(heap.pop()).toStrictEqual([
            4,
            4,
        ]);
        expect(heap.pop()).toStrictEqual([
            5,
            5,
        ]);

        heap.push([
            4,
            4,
        ]);
        heap.push([
            44,
            44,
        ]);

        expect(heap.pop()).toStrictEqual([
            4,
            4,
        ]);

        expect(heap.getFirst()).toStrictEqual([
            6,
            6,
        ]);
        expect(heap.pop()).toStrictEqual([
            6,
            6,
        ]);
        expect(heap.getFirst()).toStrictEqual([
            8,
            '-8',
        ]);
        expect(heap.pop()).toStrictEqual([
            8,
            '-8',
        ]);

        expect(heap.getFirst()).toStrictEqual([
            44,
            44,
        ]);
        expect(heap.pop()).toStrictEqual([
            44,
            44,
        ]);
        expect(heap.pop()).toStrictEqual([
            3000,
            3000,
        ]);
        expect(heap.getFirst()).toStrictEqual(undefined);
        expect(heap.pop()).toStrictEqual(undefined);
        expect(heap.getFirst()).toStrictEqual(undefined);
        expect(heap.getSize()).toStrictEqual(0);
    });

    it('add correctly', () => {
        const heap = new MinMaxHeap((a: number, b: number) => b - a);

        heap.push([
            1,
            'a',
        ]);
        heap.push([
            3,
            'c',
        ]);
        heap.push([
            2,
            'b',
        ]);

        expect(heap.pop()).toStrictEqual([
            3,
            'c',
        ]);
        expect(heap.pop()).toStrictEqual([
            2,
            'b',
        ]);
        expect(heap.pop()).toStrictEqual([
            1,
            'a',
        ]);
        expect(heap.pop()).toStrictEqual(undefined);
    });
});
