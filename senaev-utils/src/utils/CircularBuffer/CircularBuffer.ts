import { UnsignedInteger } from '../../types/Number/UnsignedInteger';

/**
 * Lightweight circular buffer implementation
 *
 * More advanced implementation is Deque
 */
export class CircularBuffer<T> {
    public length = 0;

    private readonly capacity: number;
    private readonly buffer: (T | undefined)[];
    private head = 0;
    private tail = 0;

    public constructor(capacity: number) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
    }

    public *[Symbol.iterator](): IterableIterator<T> {
        for (let i = 0; i < this.length; i++) {
            const index = (this.head + i) % this.capacity;
            const item = this.buffer[index];

            yield item!;
        }
    }

    public at(index: number): T | undefined {
        if (this.length === 0) {
            return undefined;
        }

        if (index < 0) {
            index = this.length + index;
        }

        if (index < 0 || index >= this.length) {
            return undefined;
        }

        return this.buffer[(this.head + index) % this.capacity];
    }

    public push(item: T): void {
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;
        if (this.length < this.capacity) {
            this.length++;
        } else {
            this.head = (this.head + 1) % this.capacity;
        }
    }

    public pop(): T | undefined {
        if (this.length === 0) {
            return undefined;
        }

        this.tail = (this.tail - 1 + this.capacity) % this.capacity;
        const item = this.buffer[this.tail];

        this.buffer[this.tail] = undefined;
        this.length--;

        return item;
    }

    public popCount(count: UnsignedInteger): T[] {
        const resultCount = Math.min(count, this.length);

        const items: T[] = [];

        for (let i = 0; i < resultCount; i++) {
            items.push(this.pop()!);
        }

        return items;
    }

    public shift(): T | undefined {
        if (this.length === 0) {
            return undefined;
        }

        const item = this.buffer[this.head];

        this.buffer[this.head] = undefined;
        this.head = (this.head + 1) % this.capacity;
        this.length--;

        return item;
    }

    public shiftCount(count: UnsignedInteger): T[] {
        const resultCount = Math.min(count, this.length);

        const items: T[] = [];

        for (let i = 0; i < resultCount; i++) {
            items.push(this.shift()!);
        }

        return items;
    }

    public unshift(item: T): void {
        this.head = (this.head - 1 + this.capacity) % this.capacity;
        this.buffer[this.head] = item;
        if (this.length < this.capacity) {
            this.length++;
        } else {
            this.tail = (this.tail - 1 + this.capacity) % this.capacity;
        }
    }
}
