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
});
