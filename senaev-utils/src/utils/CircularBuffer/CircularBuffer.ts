/**
 * Lightweight circular buffer implementation
 *
 * More advanced implementation is Deque
 */
export class CircularBuffer<T> {
    private readonly capacity: number;
    private readonly buffer: (T | undefined)[];
    private head = 0;
    private tail = 0;
    private size = 0;

    public constructor(capacity: number) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
    }

    public get length(): number {
        return this.size;
    }

    public *[Symbol.iterator](): IterableIterator<T> {
        for (let i = 0; i < this.size; i++) {
            const index = (this.head + i) % this.capacity;
            const item = this.buffer[index];

            yield item!;
        }
    }

    public push(item: T): void {
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;
        if (this.size < this.capacity) {
            this.size++;
        } else {
            this.head = (this.head + 1) % this.capacity;
        }
    }

    public pop(): T | undefined {
        if (this.size === 0) {
            return undefined;
        }

        this.tail = (this.tail - 1 + this.capacity) % this.capacity;
        const item = this.buffer[this.tail];

        this.buffer[this.tail] = undefined;
        this.size--;

        return item;
    }

    public shift(): T | undefined {
        if (this.size === 0) {
            return undefined;
        }

        const item = this.buffer[this.head];

        this.buffer[this.head] = undefined;
        this.head = (this.head + 1) % this.capacity;
        this.size--;

        return item;
    }

    public unshift(item: T): void {
        this.head = (this.head - 1 + this.capacity) % this.capacity;
        this.buffer[this.head] = item;
        if (this.size < this.capacity) {
            this.size++;
        } else {
            this.tail = (this.tail - 1 + this.capacity) % this.capacity;
        }
    }
}
