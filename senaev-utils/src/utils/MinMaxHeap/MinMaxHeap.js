export class MinMaxHeap {
    constructor (compare) {
        this._heap = [];
        this._compare = compare;
    }

    push(value) {
        this._heap.push(value);

        this._bubbleUp();
    }

    getFirst() {
        return this._heap[0];
    }

    getSize() {
        return this._heap.length;
    }

    pop() {
        if (this._heap.length <= 1) {
            return this._heap.pop();
        }

        const top = this._heap[0];

        this._heap[0] = this._heap.pop();
        this._bubbleDown();

        return top;
    }

    _bubbleUp() {
        let idx = this._heap.length - 1;
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            const current = this._heap[idx];
            const parent = this._heap[parentIdx];

            if (this._compare(parent[0], current[0]) < 0) {
                break;
            }

            this._heap[idx] = parent;
            this._heap[parentIdx] = current;

            idx = parentIdx;
        }
    }

    _bubbleDown() {
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
                const rightIsPrior = this._compare(this._heap[rightIdx][0], this._heap[leftIdx][0]) < 0;

                if (rightIsPrior) {
                    smallestIdx = rightIdx;
                }
            }

            const value = this._heap[idx];
            const smallestValue = this._heap[smallestIdx];
            if (this._compare(value[0], smallestValue[0]) < 0) {
                break;
            }

            this._heap[idx] = smallestValue;
            this._heap[smallestIdx] = value;

            idx = smallestIdx;
        }
    }
}
