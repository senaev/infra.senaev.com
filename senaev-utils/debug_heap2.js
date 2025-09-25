// Let's trace the exact bubble up logic
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
    
    _bubbleUp() {
        let idx = this._heap.length - 1;
        
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            const current = this._heap[idx];
            const parent = this._heap[parentIdx];
            
            console.log(`  idx=${idx}, parentIdx=${parentIdx}`);
            console.log(`  parent=${JSON.stringify(parent)}, current=${JSON.stringify(current)}`);
            console.log(`  parent[0]=${parent[0]}, current[0]=${current[0]}`);
            console.log(`  parent[0] <= current[0]? ${parent[0]} <= ${current[0]} = ${parent[0] <= current[0]}`);
            
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
}

const heap = new MinHeap();
heap.push([1, 'a']);
heap.push([3, 'c']);
heap.push([2, 'b']);
