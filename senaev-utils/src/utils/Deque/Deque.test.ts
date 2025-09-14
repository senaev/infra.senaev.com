import { noop } from 'senaev-utils/src/utils/Function/noop';
import {
    describe, expect, it,
} from 'vitest';

import { Deque } from './Deque';

describe('Denque is iterable', () => {

    it('should not iterate empty deque', () => {
        const a = new Deque();

        let i = 0;

        for (const item of a) {
            noop(item);
            i++;
        }

        expect(i).toBe(0);
    });

    it('should be normally iterable', () => {
        const a = new Deque([
            0,
            1,
            2,
            3,
            4,
        ]);

        let i = 0;

        for (const item of a) {
            expect(item).toBe(i);
            i++;
        }

        expect(i).toBe(5);
    });
});

describe('Denque.prototype.constructor', () => {
    it('should take no argument', () => {
        const a = new Deque();

        expect(a._capacityMask).toBe(3);
        expect(a._list.length).toBe(4);
        expect(a.length).toBe(0);
    });

    it('should take array argument', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
        ]);
        const b = new Deque([]);

        expect(a.length).toBeGreaterThanOrEqual(4);
        expect(a.toArray()).toEqual([
            1,
            2,
            3,
            4,
        ]);
        expect(b.length).toBe(0);
        expect(b.toArray()).toEqual([]);
    });

    it('should handle a high volume with no out of memory exception', () => {
        const denque = new Deque();
        let l = 250000;

        while (--l) {
            denque.push(l);
            denque.unshift(l);
        }

        l = 125000;
        while (--l) {
            const a = denque.shift();

            denque.pop();
            denque.shift();
            denque.push(a);
            denque.shift();
            denque.shift();
        }

        // console.log(denque._list.length);
        // console.log(denque.length);
        // console.log(denque._head);
        // console.log(denque._tail);

        denque.clear();
        l = 100000;

        while (--l) {
            denque.push(l);
        }

        l = 100000;
        while (--l) {
            denque.shift();
            denque.shift();
            denque.shift();
            if (l === 25000) {
                denque.clear();
            }

            denque.pop();
            denque.pop();
            denque.pop();
        }

        // console.log(denque._list.length);
        // console.log(denque.length);
        // console.log(denque._head);
        // console.log(denque._tail);

    });
});

describe('Denque.prototype.toArray', () => {
    it('should return an array', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
        ]);

        expect(a.toArray()).toEqual([
            1,
            2,
            3,
            4,
        ]);
    });
});

describe('Denque.prototype.push', () => {
    it('Should do nothing if no arguments', () => {
        const a = new Deque();
        const before = a.length;
        const ret = a.push();

        expect(ret).toBe(before);
        expect(a.length).toBe(ret);
        expect(ret).toBe(0);
    });

    it('Should accept undefined values', () => {
        const a = new Deque();

        a.push(undefined);
        expect(a.length).toBe(1);
    });

    it('Should add falsey elements (except undefined)', () => {
        const a = new Deque();
        // var before = a.length;
        let ret = a.push(0);

        expect(ret).toBe(1);
        expect(a.length).toBe(1);
        expect(a.at(0)).toBe(0);
        ret = a.push('');
        expect(ret).toBe(2);
        expect(a.length).toBe(2);
        expect(a.at(1)).toBe('');
        ret = a.push(null);
        expect(ret).toBe(3);
        expect(a.length).toBe(3);
        expect(a.at(2)).toBe(null);
    });

    it('Should add single argument - plenty of capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
        ]);

        expect(a._list.length - a.length).toBeGreaterThan(1);
        const before = a.length;
        const ret = a.push(1);

        expect(ret).toBe(before + 1);
        expect(a.length).toBe(ret);
        expect(ret).toBe(6);
        expect(a.toArray()).toEqual([
            1,
            2,
            3,
            4,
            5,
            1,
        ]);
    });

    it('Should add single argument - exact capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
        ]);

        expect(a._list.length - a.length).toBe(1);
        const before = a.length;
        const ret = a.push(1);

        expect(ret).toBe(before + 1);
        expect(a.length).toBe(ret);
        expect(ret).toBe(16);
        expect(a.toArray()).toEqual([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            1,
        ]);
    });

    it('Should add single argument - over capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
        ]);

        expect(a._list.length / a.length).toBe(2);
        const before = a.length;
        const ret = a.push(1);

        expect(ret).toBe(before + 1);
        expect(a.length).toBe(ret);
        expect(ret).toBe(17);
        expect(a.toArray()).toEqual([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            1,
        ]);
    });

    it('should respect capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
        ], { capacity: 3 });

        a.push(4);

        expect(a.length).toBe(3);
        expect(a.at(0)).toBe(2);
        expect(a.at(1)).toBe(3);
        expect(a.at(2)).toBe(4);
    });

});

describe('Denque.prototype.unshift', () => {

    it('Should do nothing if no arguments', () => {
        const a = new Deque();
        const before = a.length;
        const ret = a.unshift();

        expect(ret).toBe(before);
        expect(a.length).toBe(ret);
        expect(ret).toBe(0);
    });

    it('Should accept undefined values', () => {
        const a = new Deque();

        a.unshift(undefined);
        expect(a.length).toBe(1);
    });

    it('Should unshift falsey elements (except undefined)', () => {
        const a = new Deque();
        // var before = a.length;
        let ret = a.unshift(0);

        expect(ret).toBe(1);
        expect(a.length).toBe(1);
        expect(a.at(0)).toBe(0);
        ret = a.unshift('');
        expect(ret).toBe(2);
        expect(a.length).toBe(2);
        expect(a.at(0)).toBe('');
        ret = a.unshift(null);
        expect(ret).toBe(3);
        expect(a.length).toBe(3);
        expect(a.at(0)).toBe(null);
    });

    it('Should add single argument - plenty of capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
        ]);

        expect(a._list.length - a.length).toBeGreaterThan(1);
        const before = a.length;
        const ret = a.unshift(1);

        expect(ret).toBe(before + 1);
        expect(a.length).toBe(ret);
        expect(ret).toBe(6);
        expect(a.toArray()).toEqual([
            1,
            1,
            2,
            3,
            4,
            5,
        ]);
    });

    it('Should add single argument - exact capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
        ]);

        expect(a._list.length - a.length).toBe(1);
        const before = a.length;
        const ret = a.unshift(1);

        expect(ret).toBe(before + 1);
        expect(a.length).toBe(ret);
        expect(ret).toBe(16);
        expect(a.toArray()).toEqual([
            1,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
        ]);
    });

    it('Should add single argument - over capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
        ]);

        expect(a._list.length / a.length).toBe(2);
        const before = a.length;
        const ret = a.unshift(1);

        expect(ret).toBe(before + 1);
        expect(a.length).toBe(ret);
        expect(ret).toBe(17);
        expect(a.toArray()).toEqual([
            1,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
        ]);
    });

    it('should respect capacity', () => {
        const a = new Deque([
            1,
            2,
            3,
        ], { capacity: 3 });

        a.unshift(0);

        expect(a.length).toBe(3);
        expect(a.at(0)).toBe(0);
        expect(a.at(1)).toBe(1);
        expect(a.at(2)).toBe(2);
    });

});

describe('Denque.prototype.pop', () => {
    it('Should return undefined when empty denque', () => {
        const a = new Deque();

        expect(a.length).toBe(0);
        expect(a.pop()).toBeUndefined();
        expect(a.pop()).toBeUndefined();
        expect(a.length).toBe(0);
    });

    it('Should return the item at the back of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.pop()).toBe(9);
        expect(a.pop()).toBe(8);
        b.pop();
        b.pop();
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.pop();
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.pop();
        expect(a.toArray()).toEqual(b);
        expect(a.pop()).toBe(b.pop());
        expect(a.toArray()).toEqual(b);
    });
});

describe('Deque.prototype.shift', () => {
    it('Should return undefined when empty denque', () => {
        const a = new Deque();

        expect(a.length).toBe(0);
        expect(a.shift()).toBeUndefined();
        expect(a.shift()).toBeUndefined();
        expect(a.length).toBe(0);
    });

    it('Should return the item at the front of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.shift()).toBe(1);
        expect(a.shift()).toBe(2);
        b.shift();
        b.shift();
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.shift();
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.shift();
        expect(a.toArray()).toEqual(b);
        expect(a.shift()).toBe(b.shift());
        expect(a.toArray()).toEqual(b);
    });
});

describe('Denque.prototype.isEmpty', () => {
    it('should return true on empty denque', () => {
        const a = new Deque();

        expect(a.isEmpty()).toBe(true);
    });

    it('should return false on denque with items', () => {
        const a = new Deque([1]);

        expect(a.isEmpty()).toBe(false);
    });
});

describe('Denque.prototype.peekBack', () => {
    it('Should return undefined when queue is empty', () => {
        const a = new Deque();

        expect(a.length).toBe(0);
        expect(a.peekBack()).toBeUndefined();
        expect(a.peekBack()).toBeUndefined();
        expect(a.length).toBe(0);
    });

    it('should return the item at the back of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);

        expect(a.peekBack()).toBe(9);

        let l = 5;

        while (l--) {
            a.pop();
        }

        expect(a.toArray()).toEqual([
            1,
            2,
            3,
            4,
        ]);

        expect(a.peekBack()).toBe(4);
    });
});

describe('Denque.prototype.clear', () => {
    it('should clear the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
        ]);

        expect(a.isEmpty()).toBe(false);
        a.clear();
        expect(a.isEmpty()).toBe(true);
    });
});

describe('Denque.prototype.removeOne', () => {
    it('Should return undefined when empty denque', () => {
        const a = new Deque();

        expect(a.length).toBe(0);
        expect(a.removeOne(1)).toBeUndefined();
        expect(a.length).toBe(0);
    });

    it('Should return undefined when index is invalid', () => {
        const a = new Deque<string>();
        const b = new Deque();

        b.push('foobar');
        b.push('foobaz');
        expect(a.length).toBe(0);
        // @ts-expect-error -- wrong type
        expect(a.removeOne('foobar')).toBeUndefined();
        // @ts-expect-error -- wrong type
        expect(b.removeOne(-1, 2)).toBe('foobaz');
        // @ts-expect-error -- wrong type
        expect(b.removeOne(-4, 0)).toBeUndefined();
        // @ts-expect-error -- wrong type
        expect(b.removeOne(3, 2)).toBeUndefined();
        // @ts-expect-error -- wrong type
        expect(a.removeOne({})).toBeUndefined();
        expect(a.length).toBe(0);
    });

});

describe('Denque.prototype.remove', () => {
    it('Should return undefined when empty denque', () => {
        const a = new Deque();

        expect(a.length).toBe(0);
        // @ts-expect-error -- wrong type
        expect(a.remove(1)).toBeUndefined();
        expect(a.remove(2, 3)).toBeUndefined();
        expect(a.length).toBe(0);
    });

    it('remove from the end of the queue if a negative index is provided', () => {
        const q = new Deque();

        q.push(1); // 1
        q.push(2); // 2
        q.push(3); // 3
        expect(q.length).toBe(3);
        expect(q.remove(-2, 2)).toEqual([
            2,
            3,
        ]); // [ 2, 3 ]
        expect(q.length).toBe(1);
    });

    it('Should return undefined if index or count invalid', () => {
        const a = new Deque();
        const b = new Deque();

        b.push('foobar');
        b.push('foobaz');
        expect(a.length).toBe(0);
        // @ts-expect-error -- wrong type
        expect(a.remove('foobar')).toBeUndefined();
        expect(b.remove(-1, 0)).toBeUndefined();
        expect(b.remove(-1, 2)!.length).toBe(1);
        expect(b.remove(-5, 1)).toBeUndefined();
        expect(b.remove(66, 0)).toBeUndefined();
        // @ts-expect-error -- wrong type
        expect(a.remove({})).toBeUndefined();
        expect(a.length).toBe(0);
    });

    it('Should return the item at the front of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.remove(0, 1)).toEqual(b.splice(0, 1));
        expect(a.remove(0, 1)).toEqual(b.splice(0, 1));
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.remove(0, 1);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(0, 1);
        expect(a.toArray()).toEqual(b);
        expect(a.remove(0, 1)).toEqual(b.splice(0, 1));
        expect(a.toArray()).toEqual(b);
    });

    it('Should return the item at the back of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);
        expect(a.remove(8, 1)).toEqual(b.splice(8, 1));
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.remove(20, 1);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(20, 1);
        expect(a.toArray()).toEqual(b);
        expect(a.remove(19, 1)).toEqual(b.splice(19, 1));
        expect(a.toArray()).toEqual(b);
    });

    it('Should return the item somewhere in the middle of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.remove(4, 1)).toEqual(b.splice(4, 1));
        expect(a.remove(5, 1)).toEqual(b.splice(5, 1));
        expect(a.remove(3, 1)).toEqual(b.splice(3, 1));
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.remove(7, 1);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(7, 1);

        expect(a.toArray()).toEqual(b);
        expect(a.remove(1, 4)).toEqual(b.splice(1, 4));
        expect(a.toArray()).toEqual(b);
    });

    it('Should remove a number of items at the front of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.remove(0, 5)).toEqual(b.splice(0, 5));
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.remove(0, 11);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(0, 11);

        expect(a.toArray()).toEqual(b);
        expect(a.remove(0, 1)).toEqual(b.splice(0, 1));
        expect(a.toArray()).toEqual(b);
    });

    it('Should remove a number of items at the back of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.remove(5, 4)).toEqual(b.splice(5, 4));
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.remove(16, 3);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(16, 3);

        expect(a.toArray()).toEqual(b);
        expect(a.remove(5, 100)).toEqual(b.splice(5, 100));
        expect(a.toArray()).toEqual(b);
    });

    it('Should remove a number of items somewhere in the middle of the denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.remove(3, 3)).toEqual(b.splice(3, 3));
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        // console.log(a.toArray())
        a.remove(8, 6);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(8, 6);

        expect(a.toArray()).toEqual(b);
        expect(a.remove(3, 3)).toEqual(b.splice(3, 3));
        expect(a.toArray()).toEqual(b);
    });

    it('Should clear denque', () => {
        const a = new Deque([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);
        a.remove(0, 9);
        b.splice(0, 9);
        expect(a.toArray()).toEqual(b);
    });
});

describe('Denque.prototype.splice', () => {
    it('Should remove and add items like native splice method at the front of denque', () => {
        const a = new Deque<number | number[]>([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b: Array<number | number[]> = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.splice(0, 2, 14, 15, 16)).toEqual([
            1,
            2,
        ]);
        a.splice(0, 0, [
            11,
            12,
            13,
        ]);

        b.splice(0, 2, 14, 15, 16);
        b.splice(0, 0, [
            11,
            12,
            13,
        ]);

        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.splice(0, 0, 17, 18, 19);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(0, 0, 17, 18, 19);
        expect(a.toArray()).toEqual(b);
        expect(a.splice(0, 2)).toEqual(b.splice(0, 2)); // remove
        expect(a.toArray()).toEqual(b);
    });

    it('Should remove and add items like native splice method at the end of denque', () => {
        const a = new Deque<number | number[]>([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b: Array<number | number[]> = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        expect(a.splice(a.length - 1, 1, 14, 15, 16)).toEqual([9]); // remove then add
        a.splice(a.length, 0, [
            11,
            12,
            13,
        ]); // add

        b.splice(b.length - 1, 1, 14, 15, 16);
        b.splice(b.length, 0, [
            11,
            12,
            13,
        ]);
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.splice(a.length, 0, 17, 18, 19);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);
        b.splice(b.length, 0, 17, 18, 19);
        expect(a.toArray()).toEqual(b);
        a.splice(18, 0, 18, 19);
        b.splice(18, 0, 18, 19);
        expect(a.toArray()).toEqual(b);
        a.splice(21, 0, 1, 2, 3, 4, 5, 6);
        b.splice(21, 0, 1, 2, 3, 4, 5, 6);
        expect(a.toArray()).toEqual(b);
        expect(a.splice(a.length - 1, 2)).toEqual(b.splice(b.length - 1, 2)); // remove
        expect(a.toArray()).toEqual(b);
    });

    it('Should remove and add items like native splice method somewhere in the middle of denque', () => {
        const a = new Deque<number | number[]>([
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
        ]);
        const b: Array<number | number[]> = [];

        b.push(1, 2, 3, 4, 5, 6, 7, 8, 9);

        a.splice(2, 0, [
            11,
            12,
            13,
        ]);
        expect(a.splice(7, 2, 14, 15, 16)).toEqual([
            7,
            8,
        ]); // remove then add
        expect(a.splice(10, 1, 17, 18)).toEqual([9]);

        b.splice(2, 0, [
            11,
            12,
            13,
        ]);
        b.splice(7, 2, 14, 15, 16);
        b.splice(10, 1, 17, 18);
        expect(a.toArray()).toEqual(b);
        a.unshift(5);
        a.unshift(4);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        a.push(1);
        a.push(2);
        a.push(3);
        a.push(4);
        a.push(5);
        a.unshift(3);
        a.unshift(2);
        a.unshift(1);
        b.unshift(1, 2, 3, 4, 5);
        b.push(1, 2, 3, 4, 5);
        b.unshift(1, 2, 3);

        expect(a.splice(3, 3, 16, 15, 14)).toEqual(b.splice(3, 3, 16, 15, 14));
        expect(a.toArray()).toEqual(b);
        expect(a.splice(6, 1)).toEqual(b.splice(6, 1));
        expect(a.toArray()).toEqual(b);
    });

    it('Should return undefined when index or count is invalid', () => {
        const a = new Deque();
        const b = new Deque();

        b.push('foobar');
        b.push('foobaz');
        expect(a.length).toBe(0);
        // @ts-expect-error -- wrong type
        expect(a.splice('foobar')).toBeUndefined();
        expect(b.splice(-1, 0)).toBeUndefined();
        expect(b.splice(-5, 1)).toBeUndefined();
        expect(b.splice(66, 0)).toBeUndefined();
        // @ts-expect-error -- wrong type
        expect(a.splice({})).toBeUndefined();
        expect(a.length).toBe(0);
    });

    it('Should return undefined when the queue is empty', () => {
        const a = new Deque();

        expect(a.length).toBe(0);
        expect(a.splice(1, 0)).toBeUndefined();
    });

    it('Should return undefined when trying to remove further than current size', () => {
        const a = new Deque();

        a.push('foobar');
        a.push('foobar1');
        a.push('foobar2');
        a.push('foobar3');
        expect(a.length).toBe(4);
        expect(a.splice(4, 234)).toBeUndefined();
    });

    it('Should remove and add items like native splice method to the empty denque', () => {
        const a = new Deque();

        expect(a.splice(0, 0, 1)).toEqual([]);
        expect(a.toArray()).toEqual([1]);
        a.clear();
        expect(a.splice(0, 0, 1, 2, 3, 4, 5)).toEqual([]);
        expect(a.toArray()).toEqual([
            1,
            2,
            3,
            4,
            5,
        ]);
        a.clear();
        expect(a.splice(0, 1, 1, 2)).toBeUndefined(); // try to add and remove together
        expect(a.toArray()).toEqual([
            1,
            2,
        ]);

        const b = new Deque<number>([]); // initialized via empty array

        expect(b.splice(0, 0, 1)).toEqual([]);
        expect(b.toArray()).toEqual([1]);
    });

    it('pop should shrink array when mostly empty', () => {
        const a = new Deque();

        for (let i = 0; i < 50000; i++) {
            a.push(i);
        }

        const maskA = a._capacityMask;

        for (let ii = 0; ii < 35000; ii++) {
            a.pop();
        }

        const maskB = a._capacityMask;

        expect(maskA > maskB).toBe(true);
    });
});
