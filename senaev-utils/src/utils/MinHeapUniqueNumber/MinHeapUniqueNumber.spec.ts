import {
    describe, expect, it,
} from 'vitest';

import { MinHeapUniqueNumber } from './MinHeapUniqueNumber';

describe('MinHeapUniqueNumber', () => {
    it('simple case', () => {
        const heap = new MinHeapUniqueNumber();

        heap.push(1);
        heap.push(3);
        heap.push(2);

        expect(heap.pop()).toStrictEqual(1);
        expect(heap.pop()).toStrictEqual(2);
        expect(heap.pop()).toStrictEqual(3);
    });

    it('should ignore duplicates', () => {
        const heap = new MinHeapUniqueNumber();

        heap.push(1);
        heap.push(2);
        heap.push(1);
        heap.push(3);

        expect(heap.pop()).toStrictEqual(1);
        expect(heap.pop()).toStrictEqual(2);

        heap.push(1);

        expect(heap.pop()).toStrictEqual(1);
        expect(heap.pop()).toStrictEqual(3);
        expect(heap.pop()).toStrictEqual(undefined);
    });

    it('more values', () => {
        const heap = new MinHeapUniqueNumber();

        heap.push(1);
        heap.push(3);
        heap.push(1000);
        heap.push(1001);
        heap.push(999);
        heap.push(-200);
        heap.push(1000);
        heap.push(-201);
        heap.push(2);
        heap.push(100);
        heap.push(101);

        expect(heap.pop()).toStrictEqual(-201);
        expect(heap.pop()).toStrictEqual(-200);
        expect(heap.pop()).toStrictEqual(1);
        expect(heap.pop()).toStrictEqual(2);
        expect(heap.pop()).toStrictEqual(3);
        expect(heap.pop()).toStrictEqual(100);

        heap.push(-10);
        heap.push(110);
        heap.push(10);
        heap.push(100);
        heap.push(-100);
        heap.push(10000);
        heap.push(1000);

        expect(heap.pop()).toStrictEqual(-100);
        expect(heap.pop()).toStrictEqual(-10);
        expect(heap.pop()).toStrictEqual(10);
        expect(heap.pop()).toStrictEqual(100);
        expect(heap.pop()).toStrictEqual(101);
        expect(heap.pop()).toStrictEqual(110);
        expect(heap.pop()).toStrictEqual(999);
        expect(heap.pop()).toStrictEqual(1000);
        expect(heap.pop()).toStrictEqual(1001);
        expect(heap.pop()).toStrictEqual(10000);

        expect(heap.pop()).toStrictEqual(undefined);
        expect(heap.pop()).toStrictEqual(undefined);
        expect(heap.pop()).toStrictEqual(undefined);

        heap.push(100);
        expect(heap.pop()).toStrictEqual(100);

        expect(heap.pop()).toStrictEqual(undefined);
        expect(heap.pop()).toStrictEqual(undefined);
        expect(heap.pop()).toStrictEqual(undefined);
    });
});
