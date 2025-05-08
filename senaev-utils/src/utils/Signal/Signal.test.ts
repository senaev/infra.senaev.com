import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { Signal } from '.';

describe('Signal', () => {
    it('should NOT supscripe one function twice', () => {
        const spy = vi.fn();

        const signal = new Signal(0);

        signal.subscribe(spy);
        signal.subscribe(spy);

        signal.next(0);
        signal.next(111);

        expect(spy).toBeCalledTimes(1);
        expect(spy).toBeCalledWith(111);
    });

    it('can subscribe and unsubscribe multiple functions', () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        const spy3 = vi.fn();
        const spy4 = vi.fn();

        const signal = new Signal('a');

        signal.subscribe(spy1, spy2);

        signal.next('b');

        signal.subscribe(spy2, spy3, spy4);

        signal.next('c');

        signal.unsubscribe(spy2, spy3);

        signal.next('d');

        signal.subscribe(spy1, spy3);

        signal.next('e');

        expect(spy1).toBeCalledTimes(4);
        expect(spy1).nthCalledWith(1, 'b');
        expect(spy1).nthCalledWith(2, 'c');
        expect(spy1).nthCalledWith(3, 'd');
        expect(spy1).nthCalledWith(4, 'e');

        expect(spy2).toBeCalledTimes(2);
        expect(spy2).nthCalledWith(1, 'b');
        expect(spy2).nthCalledWith(2, 'c');

        expect(spy3).toBeCalledTimes(2);
        expect(spy3).nthCalledWith(1, 'c');
        expect(spy3).nthCalledWith(2, 'e');

        expect(spy4).toBeCalledTimes(3);
        expect(spy4).nthCalledWith(1, 'c');
        expect(spy4).nthCalledWith(2, 'd');
        expect(spy4).nthCalledWith(3, 'e');
    });

    it('default checkToEqualFunction', () => {
        const spy = vi.fn();

        const signal = new Signal(0);

        signal.subscribe(spy);

        signal.next(0);

        signal.next(111);

        signal.next(222);

        expect(signal.value()).toEqual(222);

        expect(spy).toBeCalledTimes(2);
        expect(spy).nthCalledWith(1, 111);
        expect(spy).nthCalledWith(2, 222);
    });

    it('should use custom checkToEqualFunction (odd/even numbers)', () => {
        const spy = vi.fn();

        const signal = new Signal(0, (a, b) => a % 2 === b % 2);

        expect(signal.value()).toEqual(0);

        signal.subscribe(spy);

        signal.next(1);
        expect(spy).nthCalledWith(1, 1);
        expect(signal.value()).toEqual(1);

        // is odd again, callbacks should not be dispatched
        signal.next(3);
        expect(spy).toBeCalledTimes(1);
        expect(signal.value()).toEqual(1);

        // now even, dispatch callbacks
        signal.next(2);
        expect(spy).nthCalledWith(2, 2);
        expect(signal.value()).toEqual(2);
    });

    it('should be able to unsubscribe functions)', () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();

        const signal = new Signal(0);

        expect(signal.value()).toEqual(0);

        const unsubscribeBoth = signal.subscribe(spy1, spy2);

        signal.next(1);
        expect(spy1).toBeCalledTimes(1);
        expect(spy1).nthCalledWith(1, 1);
        expect(spy2).toBeCalledTimes(1);
        expect(spy2).nthCalledWith(1, 1);

        signal.unsubscribe(spy1);
        signal.next(2);
        expect(spy1).toBeCalledTimes(1);
        expect(spy2).toBeCalledTimes(2);
        expect(spy2).nthCalledWith(2, 2);

        unsubscribeBoth();

        signal.next(3);
        expect(spy1).toBeCalledTimes(1);
        expect(spy2).toBeCalledTimes(2);
    });
});
