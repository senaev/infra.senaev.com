export class MinHeapUniqueNumber {
    private readonly _heap: number[];
    private readonly _set: Set<number> = new Set();

    public constructor() {
        this._heap = [];
    }

    public push(value: number): void {
        if (this._set.has(value)) {
            return;
        }

        this._set.add(value);

        this._heap.push(value);
        this._bubbleUp();
    }

    public getFirst(): number | undefined {
        return this._heap[0];
    }

    public getSize(): number {
        return this._heap.length;
    }

    public pop(): number | undefined {
        if (this._heap.length === 0) {
            return undefined;
        }

        if (this._heap.length <= 1) {
            const value = this._heap.pop()!;

            this._set.delete(value);

            return value;
        }

        const top = this._heap[0];

        this._heap[0] = this._heap.pop()!;
        this._bubbleDown();

        this._set.delete(top);

        return top;
    }

    private _bubbleUp(): void {
        let idx = this._heap.length - 1;

        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            const current = this._heap[idx];
            const parent = this._heap[parentIdx];

            if (parent < current) {
                break;
            }

            this._heap[idx] = parent;
            this._heap[parentIdx] = current;

            idx = parentIdx;
        }
    }

    private _bubbleDown(): void {
        let idx = 0;

        while (true) {
            const leftIdx = 2 * idx + 1;
            const rightIdx = 2 * idx + 2;

            if (leftIdx >= this._heap.length) {
                break;
            }

            let smallestIdx = leftIdx;
            const hasRight = rightIdx < this._heap.length;

            if (hasRight) {
                const rightIsPrior = this._heap[rightIdx] < this._heap[leftIdx];

                if (rightIsPrior) {
                    smallestIdx = rightIdx;
                }
            }

            const value = this._heap[idx];
            const smallestValue = this._heap[smallestIdx];

            if (value < smallestValue) {
                break;
            }

            this._heap[idx] = smallestValue;
            this._heap[smallestIdx] = value;

            idx = smallestIdx;
        }
    }
}
