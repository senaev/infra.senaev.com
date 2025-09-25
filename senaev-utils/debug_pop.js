// Let's trace the pop operations
class MinHeap {
    constructor() {
        this._heap = [];
    }
    
    push(value) {
        this._heap.push(value);
        this._bubbleUp();
    }
    
    pop() {
        console.log(`Pop: heap before = ${JSON.stringify(this._heap)}`);
        
        if (this._heap.length <= 1) {
            const result = this._heap.pop();
            console.log(`Pop: returning ${JSON.stringify(result)} (length <= 1)`);
            return result;
        }
        
        const top = this._heap[0];
        console.log(`Pop: top = ${JSON.stringify(top)}`);
        
        this._heap[0] = this._heap.pop();
        console.log(`Pop: after moving last to root = ${JSON.stringify(this._heap)}`);
        
        this._bubbleDown();
        console.log(`Pop: after bubble down = ${JSON.stringify(this._heap)}`);
        
        return top;
    }
    
    _bubbleUp() {
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
    
    _bubbleDown() {
        let idx = 0;
        
        while (true) {
            const leftIdx = 2 * idx + 1;
            const rightIdx = 2 * idx + 2;
            
            console.log(`  BubbleDown: idx=${idx}, leftIdx=${leftIdx}, rightIdx=${rightIdx}`);
            console.log(`  BubbleDown: heap length=${this._heap.length}`);
            
            if (leftIdx >= this._heap.length) {
                console.log(`  BubbleDown: breaking (no left child)`);
                break;
            }
            
            let smallestIdx = leftIdx;
            const hasRight = rightIdx < this._heap.length;
            
            console.log(`  BubbleDown: hasRight=${hasRight}`);
            
            if (hasRight) {
                console.log(`  BubbleDown: comparing right[${rightIdx}]=${this._heap[rightIdx][0]} with left[${leftIdx}]=${this._heap[leftIdx][0]}`);
                const rightIsPrior = this._heap[rightIdx][0] < this._heap[leftIdx][0];
                console.log(`  BubbleDown: rightIsPrior=${rightIsPrior}`);
                
                if (rightIsPrior) {
                    smallestIdx = rightIdx;
                    console.log(`  BubbleDown: smallestIdx changed to ${smallestIdx}`);
                }
            }
            
            const value = this._heap[idx];
            const smallestValue = this._heap[smallestIdx];
            
            console.log(`  BubbleDown: comparing current[${idx}]=${value[0]} with smallest[${smallestIdx}]=${smallestValue[0]}`);
            console.log(`  BubbleDown: value[0] >= smallestValue[0]? ${value[0]} >= ${smallestValue[0]} = ${value[0] >= smallestValue[0]}`);
            
            if (value[0] >= smallestValue[0]) {
                console.log(`  BubbleDown: breaking (current >= smallest)`);
                break;
            }
            
            console.log(`  BubbleDown: swapping current=${value[0]} with smallest=${smallestValue[0]}`);
            this._heap[idx] = smallestValue;
            this._heap[smallestIdx] = value;
            
            idx = smallestIdx;
        }
    }
}

const heap = new MinHeap();
heap.push([1, 'a']);
heap.push([3, 'c']);
heap.push([2, 'b']);

console.log('Initial heap:', JSON.stringify(heap._heap));
console.log('\n=== First Pop ===');
console.log('Result:', heap.pop());
console.log('\n=== Second Pop ===');
console.log('Result:', heap.pop());
