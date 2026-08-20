import {
    describe,
    expect,
    it,
} from 'vitest';

import { CircularBuffer } from './CircularBuffer';

describe('CircularBuffer', () => {
    describe('constructor', () => {
        it('should create buffer with specified capacity', () => {
            const buffer = new CircularBuffer<number>(5);

            expect(buffer.length).toBe(0);
        });

        it('should create buffer with capacity 1', () => {
            const buffer = new CircularBuffer<string>(1);

            expect(buffer.length).toBe(0);
        });

        it('should create buffer with large capacity', () => {
            const buffer = new CircularBuffer<boolean>(1000);

            expect(buffer.length).toBe(0);
        });
    });

    describe('length', () => {
        it('should return 0 for empty buffer', () => {
            const buffer = new CircularBuffer<number>(3);

            expect(buffer.length).toBe(0);
        });

        it('should return correct length after push operations', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            expect(buffer.length).toBe(1);

            buffer.push(2);
            expect(buffer.length).toBe(2);

            buffer.push(3);
            expect(buffer.length).toBe(3);
        });

        it('should maintain capacity when pushing beyond capacity', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);

            expect(buffer.length).toBe(3);
        });

        it('should decrease length after shift operations', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            buffer.shift();
            expect(buffer.length).toBe(2);

            buffer.shift();
            expect(buffer.length).toBe(1);

            buffer.shift();
            expect(buffer.length).toBe(0);
        });
    });

    describe('push', () => {
        it('should add items to empty buffer', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([1]);

            buffer.push(2);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);
        });

        it('should add items to buffer with capacity 1', () => {
            const buffer = new CircularBuffer<string>(1);

            buffer.push('first');
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual(['first']);

            buffer.push('second');
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual(['second']);
        });

        it('should overwrite oldest items when capacity is exceeded', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            expect([...buffer]).toEqual([
                1,
                2,
                3,
            ]);

            buffer.push(4);
            expect(buffer.length).toBe(3);
            expect([...buffer]).toEqual([
                2,
                3,
                4,
            ]);

            buffer.push(5);
            expect([...buffer]).toEqual([
                3,
                4,
                5,
            ]);
        });

        it('should handle multiple overwrites', () => {
            const buffer = new CircularBuffer<number>(2);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);
            buffer.push(5);

            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                4,
                5,
            ]);
        });

        it('should handle undefined values', () => {
            const buffer = new CircularBuffer<number | undefined>(3);

            buffer.push(1);
            buffer.push(undefined);
            buffer.push(3);

            expect(buffer.length).toBe(3);
            expect([...buffer]).toEqual([
                1,
                undefined,
                3,
            ]);

            buffer.shift();
            expect([...buffer]).toEqual([
                undefined,
                3,
            ]);

            buffer.push(undefined);
            expect([...buffer]).toEqual([
                undefined,
                3,
                undefined,
            ]);

            buffer.push(undefined);
            expect([...buffer]).toEqual([
                3,
                undefined,
                undefined,
            ]);

            buffer.push(undefined);
            expect([...buffer]).toEqual([
                undefined,
                undefined,
                undefined,
            ]);

            buffer.shift();
            expect([...buffer]).toEqual([
                undefined,
                undefined,
            ]);

            buffer.shift();
            expect([...buffer]).toEqual([undefined]);

            buffer.shift();
            expect([...buffer]).toEqual([]);

            buffer.shift();
            expect([...buffer]).toEqual([]);

            buffer.shift();
            expect([...buffer]).toEqual([]);

            buffer.push(undefined);
            expect([...buffer]).toEqual([undefined]);

            buffer.push(undefined);
            expect([...buffer]).toEqual([
                undefined,
                undefined,
            ]);

            buffer.push(undefined);
            expect([...buffer]).toEqual([
                undefined,
                undefined,
                undefined,
            ]);

            buffer.push(undefined);
            expect([...buffer]).toEqual([
                undefined,
                undefined,
                undefined,
            ]);
        });

        it('should handle null values', () => {
            const buffer = new CircularBuffer<number | null>(3);

            buffer.push(1);
            buffer.push(null);
            buffer.push(3);

            expect(buffer.length).toBe(3);
            expect([...buffer]).toEqual([
                1,
                null,
                3,
            ]);
        });

        it('should handle objects', () => {
            const buffer = new CircularBuffer<{ id: number; name: string }>(2);

            buffer.push({
                id: 1,
                name: 'first',
            });
            buffer.push({
                id: 2,
                name: 'second',
            });

            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                {
                    id: 1,
                    name: 'first',
                },
                {
                    id: 2,
                    name: 'second',
                },
            ]);
        });
    });

    describe('shift', () => {
        it('should return undefined for empty buffer', () => {
            const buffer = new CircularBuffer<number>(3);

            expect(buffer.shift()).toBeUndefined();
            expect(buffer.length).toBe(0);
        });

        it('should return and remove first item', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.shift()).toBe(1);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                2,
                3,
            ]);
        });

        it('should return items in FIFO order', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.shift()).toBe(1);
            expect(buffer.shift()).toBe(2);
            expect(buffer.shift()).toBe(3);
            expect(buffer.length).toBe(0);
        });

        it('should handle shift after capacity overflow', () => {
            const buffer = new CircularBuffer<number>(2);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3); // overwrites 1

            expect(buffer.shift()).toBe(2);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([3]);
        });

        it('should handle multiple shifts after overflow', () => {
            const buffer = new CircularBuffer<number>(2);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);

            expect(buffer.shift()).toBe(3);
            expect(buffer.shift()).toBe(4);
            expect(buffer.shift()).toBeUndefined();
            expect(buffer.length).toBe(0);
        });

        it('should handle undefined values', () => {
            const buffer = new CircularBuffer<number | undefined>(3);

            buffer.push(1);
            buffer.push(undefined);
            buffer.push(3);

            expect(buffer.shift()).toBe(1);
            expect(buffer.shift()).toBe(undefined);
            expect(buffer.shift()).toBe(3);
        });

        it('should handle null values', () => {
            const buffer = new CircularBuffer<number | null>(3);

            buffer.push(1);
            buffer.push(null);
            buffer.push(3);

            expect(buffer.shift()).toBe(1);
            expect(buffer.shift()).toBe(null);
            expect(buffer.shift()).toBe(3);
        });
    });

    describe('pop', () => {
        it('should return undefined for empty buffer', () => {
            const buffer = new CircularBuffer<number>(3);

            expect(buffer.pop()).toBeUndefined();
            expect(buffer.length).toBe(0);
        });

        it('should return and remove last item', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.pop()).toBe(3);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);
        });

        it('should return items in LIFO order', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.pop()).toBe(3);
            expect(buffer.pop()).toBe(2);
            expect(buffer.pop()).toBe(1);
            expect(buffer.length).toBe(0);
        });

        it('should handle pop after capacity overflow', () => {
            const buffer = new CircularBuffer<number>(2);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3); // overwrites 1

            expect(buffer.pop()).toBe(3);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([2]);
        });

        it('should handle multiple pops after overflow', () => {
            const buffer = new CircularBuffer<number>(2);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);

            expect(buffer.pop()).toBe(4);
            expect(buffer.pop()).toBe(3);
            expect(buffer.pop()).toBeUndefined();
            expect(buffer.length).toBe(0);
        });

        it('should handle undefined values', () => {
            const buffer = new CircularBuffer<number | undefined>(3);

            buffer.push(1);
            buffer.push(undefined);
            buffer.push(3);

            expect(buffer.pop()).toBe(3);
            expect(buffer.pop()).toBe(undefined);
            expect(buffer.pop()).toBe(1);
        });

        it('should handle null values', () => {
            const buffer = new CircularBuffer<number | null>(3);

            buffer.push(1);
            buffer.push(null);
            buffer.push(3);

            expect(buffer.pop()).toBe(3);
            expect(buffer.pop()).toBe(null);
            expect(buffer.pop()).toBe(1);
        });

        it('should handle alternating push and pop', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            expect(buffer.pop()).toBe(2);
            expect([...buffer]).toEqual([1]);

            buffer.push(3);
            buffer.push(4);
            expect([...buffer]).toEqual([
                1,
                3,
                4,
            ]);

            expect(buffer.pop()).toBe(4);
            expect(buffer.pop()).toBe(3);
            expect([...buffer]).toEqual([1]);
        });
    });

    describe('unshift', () => {
        it('should add items to empty buffer', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.unshift(1);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([1]);

            buffer.unshift(2);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                2,
                1,
            ]);
        });

        it('should add items to buffer with capacity 1', () => {
            const buffer = new CircularBuffer<string>(1);

            buffer.unshift('first');
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual(['first']);

            buffer.unshift('second');
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual(['second']);
        });

        it('should overwrite oldest items when capacity is exceeded', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.unshift(1);
            buffer.unshift(2);
            buffer.unshift(3);
            expect([...buffer]).toEqual([
                3,
                2,
                1,
            ]);

            buffer.unshift(4);
            expect(buffer.length).toBe(3);
            expect([...buffer]).toEqual([
                4,
                3,
                2,
            ]);

            buffer.unshift(5);
            expect([...buffer]).toEqual([
                5,
                4,
                3,
            ]);
        });

        it('should handle multiple overwrites', () => {
            const buffer = new CircularBuffer<number>(2);

            buffer.unshift(1);
            buffer.unshift(2);
            buffer.unshift(3);
            buffer.unshift(4);
            buffer.unshift(5);

            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                5,
                4,
            ]);
        });

        it('should handle undefined values', () => {
            const buffer = new CircularBuffer<number | undefined>(3);

            buffer.unshift(1);
            buffer.unshift(undefined);
            buffer.unshift(3);

            expect(buffer.length).toBe(3);
            expect([...buffer]).toEqual([
                3,
                undefined,
                1,
            ]);
        });

        it('should handle null values', () => {
            const buffer = new CircularBuffer<number | null>(3);

            buffer.unshift(1);
            buffer.unshift(null);
            buffer.unshift(3);

            expect(buffer.length).toBe(3);
            expect([...buffer]).toEqual([
                3,
                null,
                1,
            ]);
        });

        it('should handle objects', () => {
            const buffer = new CircularBuffer<{ id: number; name: string }>(2);

            buffer.unshift({
                id: 1,
                name: 'first',
            });
            buffer.unshift({
                id: 2,
                name: 'second',
            });

            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                {
                    id: 2,
                    name: 'second',
                },
                {
                    id: 1,
                    name: 'first',
                },
            ]);
        });

        it('should handle alternating unshift and shift', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.unshift(1);
            buffer.unshift(2);
            expect(buffer.shift()).toBe(2);
            expect([...buffer]).toEqual([1]);

            buffer.unshift(3);
            buffer.unshift(4);
            expect([...buffer]).toEqual([
                4,
                3,
                1,
            ]);

            expect(buffer.shift()).toBe(4);
            expect(buffer.shift()).toBe(3);
            expect([...buffer]).toEqual([1]);
        });
    });

    describe('mixed operations', () => {
        it('should handle push, pop, shift, and unshift together', () => {
            const buffer = new CircularBuffer<number>(4);

            // Start with push operations
            buffer.push(1);
            buffer.push(2);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);

            // Add with unshift
            buffer.unshift(0);
            expect([...buffer]).toEqual([
                0,
                1,
                2,
            ]);

            // Remove from front
            expect(buffer.shift()).toBe(0);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);

            // Remove from back
            expect(buffer.pop()).toBe(2);
            expect([...buffer]).toEqual([1]);

            // Add more items
            buffer.push(3);
            buffer.unshift(-1);
            expect([...buffer]).toEqual([
                -1,
                1,
                3,
            ]);

            // Fill to capacity
            buffer.push(4);
            expect([...buffer]).toEqual([
                -1,
                1,
                3,
                4,
            ]);

            // Overflow with unshift
            buffer.unshift(-2);
            expect([...buffer]).toEqual([
                -2,
                -1,
                1,
                3,
            ]);

            // Overflow with push
            buffer.push(5);
            expect([...buffer]).toEqual([
                -1,
                1,
                3,
                5,
            ]);
        });

        it('should maintain consistency with complex operations', () => {
            const buffer = new CircularBuffer<number>(3);

            // Fill buffer
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            expect([...buffer]).toEqual([
                1,
                2,
                3,
            ]);

            // Remove from both ends
            expect(buffer.shift()).toBe(1);
            expect(buffer.pop()).toBe(3);
            expect([...buffer]).toEqual([2]);

            // Add to both ends
            buffer.unshift(0);
            buffer.push(4);
            expect([...buffer]).toEqual([
                0,
                2,
                4,
            ]);

            // Overflow from front
            buffer.unshift(-1);
            expect([...buffer]).toEqual([
                -1,
                0,
                2,
            ]);

            // Overflow from back
            buffer.push(5);
            expect([...buffer]).toEqual([
                0,
                2,
                5,
            ]);
        });

        it('should handle rapid mixed operations', () => {
            const buffer = new CircularBuffer<number>(5);

            // Rapid mixed operations
            for (let i = 0; i < 50; i++) {
                const operation = i % 4;

                switch (operation) {
                case 0:
                    buffer.push(i);
                    break;
                case 1:
                    buffer.unshift(i);
                    break;
                case 2:
                    buffer.shift();
                    break;
                case 3:
                    buffer.pop();
                    break;
                }
            }

            expect(buffer.length).toBeLessThanOrEqual(5);
        });
    });

    describe('toArray', () => {
        it('should return empty array for empty buffer', () => {
            const buffer = new CircularBuffer<number>(3);

            expect([...buffer]).toEqual([]);
        });

        it('should return items in correct order', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect([...buffer]).toEqual([
                1,
                2,
                3,
            ]);
        });

        it('should return correct order after capacity overflow', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);

            expect([...buffer]).toEqual([
                2,
                3,
                4,
            ]);
        });

        it('should return correct order after multiple overflows', () => {
            const buffer = new CircularBuffer<number>(2);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);
            buffer.push(5);

            expect([...buffer]).toEqual([
                4,
                5,
            ]);
        });

        it('should return correct order after shifts', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            buffer.shift();

            expect([...buffer]).toEqual([
                2,
                3,
            ]);
        });

        it('should return correct order after shifts and pushes', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.shift();
            buffer.push(4);

            expect([...buffer]).toEqual([
                2,
                3,
                4,
            ]);
        });

        it('should handle complex circular operations', () => {
            const buffer = new CircularBuffer<number>(3);

            // Fill buffer
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            expect([...buffer]).toEqual([
                1,
                2,
                3,
            ]);

            // Overflow
            buffer.push(4);
            expect([...buffer]).toEqual([
                2,
                3,
                4,
            ]);

            // Shift and push
            buffer.shift();
            buffer.push(5);
            expect([...buffer]).toEqual([
                3,
                4,
                5,
            ]);

            // Multiple shifts
            buffer.shift();
            buffer.shift();
            expect([...buffer]).toEqual([5]);

            // Fill again
            buffer.push(6);
            buffer.push(7);
            expect([...buffer]).toEqual([
                5,
                6,
                7,
            ]);
        });

        it('should handle objects correctly', () => {
            const buffer = new CircularBuffer<{ id: number; name: string }>(2);

            buffer.push({
                id: 1,
                name: 'first',
            });
            buffer.push({
                id: 2,
                name: 'second',
            });

            const result = [...buffer];

            expect(result).toEqual([
                {
                    id: 1,
                    name: 'first',
                },
                {
                    id: 2,
                    name: 'second',
                },
            ]);

            // Verify objects are not the same reference
            expect(result[0]).toBe(buffer['buffer'][0]);
            expect(result[1]).toBe(buffer['buffer'][1]);
        });
    });

    describe('integration tests', () => {
        it('should handle rapid push and shift operations', () => {
            const buffer = new CircularBuffer<number>(5);

            // Rapid operations
            for (let i = 0; i < 100; i++) {
                buffer.push(i);
                if (i % 3 === 0) {
                    buffer.shift();
                }
            }

            expect(buffer.length).toBeLessThanOrEqual(5);
        });

        it('should maintain consistency with capacity 1', () => {
            const buffer = new CircularBuffer<string>(1);

            buffer.push('a');
            expect([...buffer]).toEqual(['a']);

            buffer.push('b');
            expect([...buffer]).toEqual(['b']);

            buffer.shift();
            expect([...buffer]).toEqual([]);

            buffer.push('c');
            expect([...buffer]).toEqual(['c']);
        });

        it('should handle alternating push and shift', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.shift();
            expect([...buffer]).toEqual([]);

            buffer.push(2);
            buffer.push(3);
            buffer.shift();
            expect([...buffer]).toEqual([3]);

            buffer.push(4);
            buffer.push(5);
            expect([...buffer]).toEqual([
                3,
                4,
                5,
            ]);
        });

        it('should handle edge case with capacity 0', () => {
            const buffer = new CircularBuffer<number>(0);

            buffer.push(1);
            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
            expect(buffer.shift()).toBeUndefined();
        });
    });

    describe('type safety', () => {
        it('should work with different types', () => {
            const numberBuffer = new CircularBuffer<number>(2);

            numberBuffer.push(1);
            numberBuffer.push(2);
            expect([...numberBuffer]).toEqual([
                1,
                2,
            ]);

            const stringBuffer = new CircularBuffer<string>(2);

            stringBuffer.push('a');
            stringBuffer.push('b');
            expect([...stringBuffer]).toEqual([
                'a',
                'b',
            ]);

            const booleanBuffer = new CircularBuffer<boolean>(2);

            booleanBuffer.push(true);
            booleanBuffer.push(false);
            expect([...booleanBuffer]).toEqual([
                true,
                false,
            ]);
        });

        it('should work with union types', () => {
            const buffer = new CircularBuffer<string | number>(3);

            buffer.push('hello');
            buffer.push(42);
            buffer.push('world');

            expect([...buffer]).toEqual([
                'hello',
                42,
                'world',
            ]);
        });
    });

    describe('shiftCount', () => {
        it('should return empty array when count is 0', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);

            const result = buffer.shiftCount(0);

            expect(result).toEqual([]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);
        });

        it('should return empty array when buffer is empty', () => {
            const buffer = new CircularBuffer<number>(3);

            const result = buffer.shiftCount(2);

            expect(result).toEqual([]);
            expect(buffer.length).toBe(0);
        });

        it('should remove and return single item from beginning', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            const result = buffer.shiftCount(1);

            expect(result).toEqual([1]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                2,
                3,
            ]);
        });

        it('should remove and return multiple items from beginning', () => {
            const buffer = new CircularBuffer<number>(5);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);
            buffer.push(5);

            const result = buffer.shiftCount(3);

            expect(result).toEqual([
                1,
                2,
                3,
            ]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                4,
                5,
            ]);
        });

        it('should remove all items when count equals buffer length', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            const result = buffer.shiftCount(3);

            expect(result).toEqual([
                1,
                2,
                3,
            ]);
            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });

        it('should remove only available items when count exceeds buffer length', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);

            const result = buffer.shiftCount(5);

            expect(result).toEqual([
                1,
                2,
            ]);
            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });

        it('should work with circular buffer that has wrapped around', () => {
            const buffer = new CircularBuffer<number>(3);

            // Fill buffer and cause wrap-around
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4); // This should overwrite 1
            buffer.push(5); // This should overwrite 2

            const result = buffer.shiftCount(2);

            expect(result).toEqual([
                3,
                4,
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([5]);
        });

        it('should work with different data types', () => {
            const buffer = new CircularBuffer<string>(3);

            buffer.push('a');
            buffer.push('b');
            buffer.push('c');

            const result = buffer.shiftCount(2);

            expect(result).toEqual([
                'a',
                'b',
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual(['c']);
        });

        it('should work with objects', () => {
            const buffer = new CircularBuffer<{ id: number; name: string }>(3);

            buffer.push({
                id: 1,
                name: 'first',
            });
            buffer.push({
                id: 2,
                name: 'second',
            });
            buffer.push({
                id: 3,
                name: 'third',
            });

            const result = buffer.shiftCount(2);

            expect(result).toEqual([
                {
                    id: 1,
                    name: 'first',
                },
                {
                    id: 2,
                    name: 'second',
                },
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([
                {
                    id: 3,
                    name: 'third',
                },
            ]);
        });

        it('should handle capacity 1 buffer', () => {
            const buffer = new CircularBuffer<number>(1);

            buffer.push(1);
            buffer.push(2); // Should overwrite 1

            const result = buffer.shiftCount(1);

            expect(result).toEqual([2]);
            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });

        it('should work correctly with mixed operations', () => {
            const buffer = new CircularBuffer<number>(4);

            buffer.push(1);
            buffer.push(2);
            buffer.unshift(0);
            buffer.push(3);

            const result = buffer.shiftCount(2);

            expect(result).toEqual([
                0,
                1,
            ]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                2,
                3,
            ]);
        });

        it('should work correctly with big value', () => {
            const buffer = new CircularBuffer<number>(8);

            buffer.push(1);
            buffer.push(2);

            const result = buffer.shiftCount(8);

            expect(result).toEqual([
                1,
                2,
            ]);

            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });
    });

    describe('popCount', () => {
        it('should return empty array when count is 0', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);

            const result = buffer.popCount(0);

            expect(result).toEqual([]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);
        });

        it('should return empty array when buffer is empty', () => {
            const buffer = new CircularBuffer<number>(3);

            const result = buffer.popCount(2);

            expect(result).toEqual([]);
            expect(buffer.length).toBe(0);
        });

        it('should remove and return single item from end', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            const result = buffer.popCount(1);

            expect(result).toEqual([3]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);
        });

        it('should remove and return multiple items from end', () => {
            const buffer = new CircularBuffer<number>(5);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);
            buffer.push(5);

            const result = buffer.popCount(3);

            expect(result).toEqual([
                5,
                4,
                3,
            ]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);
        });

        it('should remove all items when count equals buffer length', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            const result = buffer.popCount(3);

            expect(result).toEqual([
                3,
                2,
                1,
            ]);
            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });

        it('should remove only available items when count exceeds buffer length', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);

            const result = buffer.popCount(5);

            expect(result).toEqual([
                2,
                1,
            ]);
            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });

        it('should work with circular buffer that has wrapped around', () => {
            const buffer = new CircularBuffer<number>(3);

            // Fill buffer and cause wrap-around
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4); // This should overwrite 1
            buffer.push(5); // This should overwrite 2

            const result = buffer.popCount(2);

            expect(result).toEqual([
                5,
                4,
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([3]);
        });

        it('should work with different data types', () => {
            const buffer = new CircularBuffer<string>(3);

            buffer.push('a');
            buffer.push('b');
            buffer.push('c');

            const result = buffer.popCount(2);

            expect(result).toEqual([
                'c',
                'b',
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual(['a']);
        });

        it('should work with objects', () => {
            const buffer = new CircularBuffer<{ id: number; name: string }>(3);

            buffer.push({
                id: 1,
                name: 'first',
            });
            buffer.push({
                id: 2,
                name: 'second',
            });
            buffer.push({
                id: 3,
                name: 'third',
            });

            const result = buffer.popCount(2);

            expect(result).toEqual([
                {
                    id: 3,
                    name: 'third',
                },
                {
                    id: 2,
                    name: 'second',
                },
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([
                {
                    id: 1,
                    name: 'first',
                },
            ]);
        });

        it('should handle capacity 1 buffer', () => {
            const buffer = new CircularBuffer<number>(1);

            buffer.push(1);
            buffer.push(2); // Should overwrite 1

            const result = buffer.popCount(1);

            expect(result).toEqual([2]);
            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });

        it('should work correctly with mixed operations', () => {
            const buffer = new CircularBuffer<number>(4);

            buffer.push(1);
            buffer.push(2);
            buffer.unshift(0);
            buffer.push(3);

            const result = buffer.popCount(2);

            expect(result).toEqual([
                3,
                2,
            ]);
            expect(buffer.length).toBe(2);
            expect([...buffer]).toEqual([
                0,
                1,
            ]);
        });

        it('should work correctly with big value', () => {
            const buffer = new CircularBuffer<number>(8);

            buffer.push(1);
            buffer.push(2);

            const result = buffer.popCount(8);

            expect(result).toEqual([
                2,
                1,
            ]);

            expect(buffer.length).toBe(0);
            expect([...buffer]).toEqual([]);
        });

        it('should handle undefined values', () => {
            const buffer = new CircularBuffer<number | undefined>(3);

            buffer.push(1);
            buffer.push(undefined);
            buffer.push(3);

            const result = buffer.popCount(2);

            expect(result).toEqual([
                3,
                undefined,
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([1]);
        });

        it('should handle null values', () => {
            const buffer = new CircularBuffer<number | null>(3);

            buffer.push(1);
            buffer.push(null);
            buffer.push(3);

            const result = buffer.popCount(2);

            expect(result).toEqual([
                3,
                null,
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([1]);
        });

        it('should maintain LIFO order', () => {
            const buffer = new CircularBuffer<number>(5);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4);
            buffer.push(5);

            const result = buffer.popCount(4);

            expect(result).toEqual([
                5,
                4,
                3,
                2,
            ]);
            expect(buffer.length).toBe(1);
            expect([...buffer]).toEqual([1]);
        });

        it('should work with alternating push and pop operations', () => {
            const buffer = new CircularBuffer<number>(4);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            const result1 = buffer.popCount(1);

            expect(result1).toEqual([3]);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);

            buffer.push(4);
            buffer.push(5);

            const result2 = buffer.popCount(2);

            expect(result2).toEqual([
                5,
                4,
            ]);
            expect([...buffer]).toEqual([
                1,
                2,
            ]);
        });
    });

    describe('at', () => {
        it('should return undefined for empty buffer', () => {
            const buffer = new CircularBuffer<number>(3);

            expect(buffer.at(0)).toBeUndefined();
            expect(buffer.at(-1)).toBeUndefined();
            expect(buffer.at(1)).toBeUndefined();
        });

        it('should return correct item for positive indices', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.at(0)).toBe(1);
            expect(buffer.at(1)).toBe(2);
            expect(buffer.at(2)).toBe(3);
        });

        it('should return correct item for negative indices', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.at(-1)).toBe(3);
            expect(buffer.at(-2)).toBe(2);
            expect(buffer.at(-3)).toBe(1);
        });

        it('should return undefined for out of bounds positive indices', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);

            expect(buffer.at(2)).toBeUndefined();
            expect(buffer.at(3)).toBeUndefined();
            expect(buffer.at(10)).toBeUndefined();
        });

        it('should return undefined for out of bounds negative indices', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);

            expect(buffer.at(-3)).toBeUndefined();
            expect(buffer.at(-4)).toBeUndefined();
            expect(buffer.at(-10)).toBeUndefined();
        });

        it('should work with capacity 1 buffer', () => {
            const buffer = new CircularBuffer<string>(1);

            buffer.push('single');

            expect(buffer.at(0)).toBe('single');
            expect(buffer.at(-1)).toBe('single');
            expect(buffer.at(1)).toBeUndefined();
            expect(buffer.at(-2)).toBeUndefined();
        });

        it('should work with circular buffer that has wrapped around', () => {
            const buffer = new CircularBuffer<number>(3);

            // Fill buffer and cause wrap-around
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4); // This should overwrite 1
            buffer.push(5); // This should overwrite 2

            expect(buffer.at(0)).toBe(3);
            expect(buffer.at(1)).toBe(4);
            expect(buffer.at(2)).toBe(5);
            expect(buffer.at(-1)).toBe(5);
            expect(buffer.at(-2)).toBe(4);
            expect(buffer.at(-3)).toBe(3);
        });

        it('should work with different data types', () => {
            const buffer = new CircularBuffer<string>(3);

            buffer.push('a');
            buffer.push('b');
            buffer.push('c');

            expect(buffer.at(0)).toBe('a');
            expect(buffer.at(-1)).toBe('c');
            expect(buffer.at(1)).toBe('b');
        });

        it('should work with objects', () => {
            const buffer = new CircularBuffer<{ id: number; name: string }>(3);

            const obj1 = {
                id: 1,
                name: 'first',
            };
            const obj2 = {
                id: 2,
                name: 'second',
            };
            const obj3 = {
                id: 3,
                name: 'third',
            };

            buffer.push(obj1);
            buffer.push(obj2);
            buffer.push(obj3);

            expect(buffer.at(0)).toBe(obj1);
            expect(buffer.at(-1)).toBe(obj3);
            expect(buffer.at(1)).toBe(obj2);
        });

        it('should handle undefined values', () => {
            const buffer = new CircularBuffer<number | undefined>(3);

            buffer.push(1);
            buffer.push(undefined);
            buffer.push(3);

            expect(buffer.at(0)).toBe(1);
            expect(buffer.at(1)).toBe(undefined);
            expect(buffer.at(2)).toBe(3);
            expect(buffer.at(-1)).toBe(3);
            expect(buffer.at(-2)).toBe(undefined);
            expect(buffer.at(-3)).toBe(1);
        });

        it('should handle null values', () => {
            const buffer = new CircularBuffer<number | null>(3);

            buffer.push(1);
            buffer.push(null);
            buffer.push(3);

            expect(buffer.at(0)).toBe(1);
            expect(buffer.at(1)).toBe(null);
            expect(buffer.at(2)).toBe(3);
            expect(buffer.at(-1)).toBe(3);
            expect(buffer.at(-2)).toBe(null);
            expect(buffer.at(-3)).toBe(1);
        });

        it('should work correctly with mixed operations', () => {
            const buffer = new CircularBuffer<number>(4);

            buffer.push(1);
            buffer.push(2);
            buffer.unshift(0);
            buffer.push(3);

            expect(buffer.at(0)).toBe(0);
            expect(buffer.at(1)).toBe(1);
            expect(buffer.at(2)).toBe(2);
            expect(buffer.at(3)).toBe(3);
            expect(buffer.at(-1)).toBe(3);
            expect(buffer.at(-2)).toBe(2);
            expect(buffer.at(-3)).toBe(1);
            expect(buffer.at(-4)).toBe(0);
        });

        it('should work with large negative indices', () => {
            const buffer = new CircularBuffer<number>(5);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.at(-100)).toBeUndefined();
            expect(buffer.at(-4)).toBeUndefined();
            expect(buffer.at(-3)).toBe(1);
            expect(buffer.at(-2)).toBe(2);
            expect(buffer.at(-1)).toBe(3);
        });

        it('should work with large positive indices', () => {
            const buffer = new CircularBuffer<number>(5);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.at(0)).toBe(1);
            expect(buffer.at(1)).toBe(2);
            expect(buffer.at(2)).toBe(3);
            expect(buffer.at(3)).toBeUndefined();
            expect(buffer.at(100)).toBeUndefined();
        });

        it('should maintain consistency after operations', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.at(0)).toBe(1);
            expect(buffer.at(-1)).toBe(3);

            buffer.shift(); // Remove first element

            expect(buffer.at(0)).toBe(2);
            expect(buffer.at(1)).toBe(3);
            expect(buffer.at(-1)).toBe(3);
            expect(buffer.at(-2)).toBe(2);

            buffer.pop(); // Remove last element

            expect(buffer.at(0)).toBe(2);
            expect(buffer.at(-1)).toBe(2);
            expect(buffer.at(1)).toBeUndefined();
        });

        it('should work with fractional indices (should be treated as out of bounds)', () => {
            const buffer = new CircularBuffer<number>(3);

            buffer.push(1);
            buffer.push(2);
            buffer.push(3);

            expect(buffer.at(0.5)).toBeUndefined();
            expect(buffer.at(1.7)).toBeUndefined();
            expect(buffer.at(-0.5)).toBeUndefined();
            expect(buffer.at(-1.3)).toBeUndefined();
        });
    });
});
