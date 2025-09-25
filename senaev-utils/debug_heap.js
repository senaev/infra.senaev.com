// Quick debug script to trace heap behavior
class MinHeap {
    constructor() {
        this._heap = [];
    }
    
    push(value) {
        console.log(`Pushing ${JSON.stringify(value)}`);
        this._heap.push(value);
        console.log(`Heap before bubble up: ${JSON.stringify(this._heap)}`);
        this._bubbleUp();
        console.log(`Heap after bubble up: ${JSON.stringify(this._heap)}`);
        console.log('---');
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
            
            console.log(`  Comparing parent[${parentIdx}]=${parent[0]} with current[${idx}]=${current[0]}`);
            
            if (parent[0] <= current[0]) {
                console.log(`  Breaking: parent <= current`);
                break;
            }
            
            console.log(`  Swapping: parent=${parent[0]} with current=${current[0]}`);
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
                const rightIsPrior = this._heap[rightIdx][0] < this._heap[leftIdx][0];
                if (rightIsPrior) {
                    smallestIdx = rightIdx;
                }
            }
            
            const value = this._heap[idx];
            const smallestValue = this._heap[smallestIdx];
            
            if (value[0] >= smallestValue[0]) {
                break;
            }
            
            this._heap[idx] = smallestValue;
            this._heap[smallestIdx] = value;
            
            idx = smallestIdx;
        }
    }
}

// Test the sequence
const heap = new MinHeap();
heap.push([1, 'a']);
heap.push([3, 'c']);
heap.push([2, 'b']);

console.log('Final heap:', JSON.stringify(heap._heap));
console.log('Popping...');
console.log('Pop 1:', heap.pop());
console.log('Pop 2:', heap.pop());
console.log('Pop 3:', heap.pop());
