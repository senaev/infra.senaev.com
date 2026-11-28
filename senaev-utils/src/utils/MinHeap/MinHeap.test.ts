import {
    describe, expect, it,
} from 'vitest';

import { MinHeap } from './MinHeap';

function addToHeap(heap: MinHeap<number>, values: number[]) {
    for (const value of values) {
        heap.push([
            value,
            value,
        ]);
    }
}

describe('MinHeap', () => {
    it('add correctly', () => {
        const heap = new MinHeap();

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
            1,
            'a',
        ]);
        expect(heap.pop()).toStrictEqual([
            2,
            'b',
        ]);
        expect(heap.pop()).toStrictEqual([
            3,
            'c',
        ]);
        expect(heap.pop()).toStrictEqual(undefined);
    });

    it('solve complex case', () => {
        const heap = new MinHeap<number>();

        const array = [
            1,
            3,
            2,
            500,
            -500,
            0,
            -1000,
            1000,
            -10000,
            10000,
            10002,
            100021,
            -100000,
            100000,
            -1000000,
        ];

        addToHeap(heap, array);

        const expected = array.sort((a, b) => a - b);

        for (const value of expected) {
            expect(heap.pop()).toStrictEqual([
                value,
                value,
            ]);
        }

        expect(heap.pop()).toStrictEqual(undefined);
    });

    it('dynamic add and remove', () => {
        const heap = new MinHeap<number>();

        addToHeap(heap, [
            500,
            1,
            3,
            2,
            -500,
        ]);

        expect(heap.pop()).toStrictEqual([
            -500,
            -500,
        ]);
        expect(heap.pop()).toStrictEqual([
            1,
            1,
        ]);

        addToHeap(heap, [
            -1,
            1,
            -200,
        ]);
        expect(heap.pop()).toStrictEqual([
            -200,
            -200,
        ]);
        expect(heap.pop()).toStrictEqual([
            -1,
            -1,
        ]);
        expect(heap.pop()).toStrictEqual([
            1,
            1,
        ]);
    });
});
