import { IterableWithIndexAccess } from '../IterableWithIndexAccess';

function _nextPowerOf2(num: number): number {
    const log2 = Math.log(num) / Math.log(2);
    const nextPow2 = 1 << (log2 + 1);

    return Math.max(nextPow2, 4);
}

/**
 * Stolen from here
 * https://github.com/invertase/denque/blob/539105bb57854e997dd469221cdc52a0ad80e0a2/index.js#L6
 */
export class Deque<T> implements IterableWithIndexAccess<T> {

    public readonly _capacity: number | undefined;
    public _head: number;
    public _tail: number;
    public _capacityMask: number;
    public _list: (T | undefined)[];

    public constructor(array?: T[], options: { capacity?: number } = {}) {
        this._capacity = options.capacity;

        this._head = 0;
        this._tail = 0;

        if (Array.isArray(array)) {
            const { length } = array;
            const capacity = _nextPowerOf2(length);

            this._list = new Array(capacity);
            this._capacityMask = capacity - 1;
            this._tail = length;

            for (let i = 0; i < length; i++) {
                this._list[i] = array[i];
            }
        } else {
            this._capacityMask = 0x3;
            this._list = new Array(4);
        }
    }

    public get length(): number {
        if (this._head === this._tail) {
            return 0;
        }

        if (this._head < this._tail) {
            return this._tail - this._head;
        } else {
            return this._capacityMask + 1 - (this._head - this._tail);
        }
    }

    public *[Symbol.iterator](): Iterator<T> {
        const { length } = this;

        for (let i = 0; i < length; i++) {
            const item = this.at(i);

            if (item !== undefined) {
                yield item;
            }
        }
    }

    /**
     * Returns the item at the specified index from the list.
     * 0 is the first element, 1 is the second, and so on...
     * Elements at negative values are that many from the end: -1 is one before the end
     * (the last element), -2 is two before the end (one before last), etc.
     */
    public at(index: number): T | undefined {
        let i = index;

        if ((i !== (i | 0))) {
            return undefined;
        }

        const len = this.length;

        if (i >= len || i < -len) {
            return undefined;
        }

        if (i < 0) {
            i += len;
        }

        i = (this._head + i) & this._capacityMask;

        return this._list[i];
    };

    public peek(): T | undefined {
        if (this._head === this._tail) {
            return undefined;
        }

        return this._list[this._head];
    };

    public peekBack(): T | undefined {
        return this.at(-1);
    }

    /**
     * Add an item at the beginning of the list
     * Returns new length of the list
     */
    public unshift(item?: T): number {
        if (arguments.length === 0) {
            return this.length;
        }

        const len = this._list.length;

        this._head = (this._head - 1 + len) & this._capacityMask;
        this._list[this._head] = item;

        if (this._tail === this._head) {
            this._growArray();
        }

        if (this._capacity && this.length > this._capacity) {
            this.pop();
        }

        if (this._head < this._tail) {
            return this._tail - this._head;
        }

        return this._capacityMask + 1 - (this._head - this._tail);
    }

    public pop(): T | undefined {
        const tail = this._tail;

        if (tail === this._head) {
            return undefined;
        }

        const len = this._list.length;

        this._tail = (tail - 1 + len) & this._capacityMask;
        const item = this._list[this._tail];

        this._list[this._tail] = undefined;
        if (this._head < 2 && tail > 10000 && tail <= len >>> 2) {
            this._shrinkArray();
        }

        return item;
    }

    public shift() {
        const head = this._head;

        if (head === this._tail) {
            return undefined;
        }

        const item = this._list[head];

        this._list[head] = undefined;
        this._head = (head + 1) & this._capacityMask;
        if (head < 2 && this._tail > 10000 && this._tail <= this._list.length >>> 2) {
            this._shrinkArray();
        }

        return item;
    }

    /**
     * Add an item to the end of the list
     * Returns new length of the list
     */
    public push(...items: T[]): number {
        if (arguments.length === 0) {
            return this.length;
        }

        const tail = this._tail;

        this._list[tail] = items[0];
        this._tail = (tail + 1) & this._capacityMask;

        if (this._tail === this._head) {
            this._growArray();
        }

        if (this._capacity && this.length > this._capacity) {
            this.shift();
        }

        if (this._head < this._tail) {
            return this._tail - this._head;
        }

        return this._capacityMask + 1 - (this._head - this._tail);
    }

    public removeOne(index: number): T | undefined {
        let i = index;

        // expect a number or return undefined
        if ((i !== (i | 0))) {
            return undefined;
        }

        if (this._head === this._tail) {
            return undefined;
        }

        const { length } = this;
        const len = this._list.length;

        if (i >= length || i < -length) {
            return undefined;
        }

        if (i < 0) {
            i += length;
        }

        i = (this._head + i) & this._capacityMask;
        const item = this._list[i];
        let k;

        if (index < length / 2) {
            for (k = index; k > 0; k--) {
                this._list[i] = this._list[i = (i - 1 + len) & this._capacityMask];
            }

            this._list[i] = undefined;
            this._head = (this._head + 1 + len) & this._capacityMask;
        } else {
            for (k = length - 1 - index; k > 0; k--) {
                this._list[i] = this._list[i = (i + 1 + len) & this._capacityMask];
            }

            this._list[i] = undefined;
            this._tail = (this._tail - 1 + len) & this._capacityMask;
        }

        return item;
    }

    public isEmpty(): boolean {
        return this._head === this._tail;
    }

    public clear(): void {
        this._list = new Array(this._list.length);
        this._head = 0;
        this._tail = 0;
    }

    public remove(index: number, count: number): T[] | undefined {
        let i = index;
        let removed;
        let del_count = count;

        // expect a number or return undefined
        if ((i !== (i | 0))) {
            return undefined;
        }

        if (this._head === this._tail) {
            return undefined;
        }

        const { length } = this;
        const len = this._list.length;

        if (i >= length || i < -length || count < 1) {
            return undefined;
        }

        if (i < 0) {
            i += length;
        }

        if (count === 1 || !count) {
            removed = new Array(1);
            removed[0] = this.removeOne(i);

            return removed;
        }

        if (i === 0 && i + count >= length) {
            removed = this.toArray();
            this.clear();

            return removed;
        }

        if (i + count > length) {
            count = length - i;
        }

        let k;

        removed = new Array(count);
        for (k = 0; k < count; k++) {
            removed[k] = this._list[(this._head + i + k) & this._capacityMask];
        }

        i = (this._head + i) & this._capacityMask;
        if (index + count === length) {
            this._tail = (this._tail - count + len) & this._capacityMask;
            for (k = count; k > 0; k--) {
                this._list[i = (i + 1 + len) & this._capacityMask] = undefined;
            }

            return removed;
        }

        if (index === 0) {
            this._head = (this._head + count + len) & this._capacityMask;
            for (k = count - 1; k > 0; k--) {
                this._list[i = (i + 1 + len) & this._capacityMask] = undefined;
            }

            return removed;
        }

        if (i < length / 2) {
            this._head = (this._head + index + count + len) & this._capacityMask;
            for (k = index; k > 0; k--) {
                this.unshift(this._list[i = (i - 1 + len) & this._capacityMask]!);
            }

            i = (this._head - 1 + len) & this._capacityMask;
            while (del_count > 0) {
                this._list[i = (i - 1 + len) & this._capacityMask] = undefined;
                del_count--;
            }

            if (index < 0) {
                this._tail = i;
            }
        } else {
            this._tail = i;
            i = (i + count + len) & this._capacityMask;
            for (k = length - (count + index); k > 0; k--) {
                this.push(this._list[i++]!);
            }

            i = this._tail;
            while (del_count > 0) {
                this._list[i = (i + 1 + len) & this._capacityMask] = undefined;
                del_count--;
            }
        }

        if (this._head < 2 && this._tail > 10000 && this._tail <= len >>> 2) {
            this._shrinkArray();
        }

        return removed;
    }

    public toArray() {
        return this._copyArray(false);
    }

    /**
     * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
     */
    public splice(
        /**
         * The zero-based location in the array from which to start removing elements.
         */
        start: number,
        /**
         * The number of elements to remove.
         */
        deleteCount: number,
        /**
         * Elements to insert into the array in place of the deleted elements.
         */
        ...items: T[]
    ): T[] | undefined {
        let i = start;

        // expect a number or return undefined
        if ((i !== (i | 0))) {
            return undefined;
        }

        const { length } = this;

        if (i < 0) {
            i += length;
        }

        if (i > length) {
            return undefined;
        }

        let itemsLength = items.length;

        if (itemsLength > 0) {
            let k;
            let temp;
            let removed;
            const len = this._list.length;
            let itemIndex = 0;

            if (!length || i < length / 2) {
                temp = new Array(i);
                for (k = 0; k < i; k++) {
                    temp[k] = this._list[(this._head + k) & this._capacityMask];
                }

                if (deleteCount === 0) {
                    removed = [];
                    if (i > 0) {
                        this._head = (this._head + i + len) & this._capacityMask;
                    }
                } else {
                    removed = this.remove(i, deleteCount);
                    this._head = (this._head + i + len) & this._capacityMask;
                }

                while (itemsLength > itemIndex) {
                    this.unshift(items[--itemsLength]);
                }

                for (k = i; k > 0; k--) {
                    this.unshift(temp[k - 1]);
                }
            } else {
                temp = new Array(length - (i + deleteCount));
                const leng = temp.length;

                for (k = 0; k < leng; k++) {
                    temp[k] = this._list[(this._head + i + deleteCount + k) & this._capacityMask];
                }

                if (deleteCount === 0) {
                    removed = [];
                    if (i !== length) {
                        this._tail = (this._head + i + len) & this._capacityMask;
                    }
                } else {
                    removed = this.remove(i, deleteCount);
                    this._tail = (this._tail - leng + len) & this._capacityMask;
                }

                while (itemIndex < itemsLength) {
                    this.push(items[itemIndex++]);
                }

                for (k = 0; k < leng; k++) {
                    this.push(temp[k]);
                }
            }

            return removed;
        } else {
            return this.remove(i, deleteCount);
        }
    }

    private _growArray() {
        if (this._head !== 0) {
            // double array size and copy existing data, head to end, then beginning to tail.
            const newList = this._copyArray(true, this._list.length << 1);

            this._tail = this._list.length;
            this._head = 0;

            this._list = newList;
        } else {
            this._tail = this._list.length;
            this._list.length <<= 1;
        }

        this._capacityMask = (this._capacityMask << 1) | 1;
    }

    private _copyArray(fullCopy: boolean, sizeToCopy?: number) {
        const src = this._list;
        const capacity = src.length;
        const { length } = this;
        const size = (sizeToCopy ?? 0) | length;

        // No prealloc requested and the buffer is contiguous
        if (size === length && this._head < this._tail) {
            // Simply do a fast slice copy
            return this._list.slice(this._head, this._tail);
        }

        const dest = new Array(size);

        let k = 0;
        let i;

        if (fullCopy || this._head > this._tail) {
            for (i = this._head; i < capacity; i++) {
                dest[k++] = src[i];
            }

            for (i = 0; i < this._tail; i++) {
                dest[k++] = src[i];
            }
        } else {
            for (i = this._head; i < this._tail; i++) {
                dest[k++] = src[i];
            }
        }

        return dest;
    }

    private _shrinkArray(): void {
        this._list.length >>>= 1;
        this._capacityMask >>>= 1;
    }

}
