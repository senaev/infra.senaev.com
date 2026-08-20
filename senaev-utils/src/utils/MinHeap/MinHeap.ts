export type MinHeapTuple<T> = [number, T];

export class MinHeap<T> {
    private _heap: MinHeapTuple<T>[];

    public constructor() {
        this._heap = [];
    }
    public push(value: MinHeapTuple<T>): void {
        this._heap.push(value);
        this._bubbleUp();
    }
    public getFirst(): MinHeapTuple<T> | undefined {
        return this._heap[0];
    }

    public getSize(): number {
        return this._heap.length;
    }

    public pop(): MinHeapTuple<T> | undefined {
        if (this._heap.length <= 1) {
            return this._heap.pop();
        }

        const top = this._heap[0];

        this._heap[0] = this._heap.pop()!;
        this._bubbleDown();

        return top;
    }

    private _bubbleUp(): void {
        let idx = this._heap.length - 1;

        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            const current = this._heap[idx];
            const parent = this._heap[parentIdx];

            if (parent[0] <= current[0]) {
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
                const rightIsPrior = this._heap[rightIdx][0] < this._heap[leftIdx][0];

                if (rightIsPrior) {
                    smallestIdx = rightIdx;
                }
            }

            const value = this._heap[idx];
            const smallestValue = this._heap[smallestIdx];

            if (value[0] <= smallestValue[0]) {
                break;
            }

            this._heap[idx] = smallestValue;
            this._heap[smallestIdx] = value;

            idx = smallestIdx;
        }
    }
}
