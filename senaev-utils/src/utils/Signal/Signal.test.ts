import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { Signal } from './Signal';

describe('Signal', () => {
    it('should NOT subscribe one function twice', () => {
        const spy = vi.fn();

        const signal = new Signal(0);

        signal.subscribe(spy);
        signal.subscribe(spy);

        signal.dispatch(0);
        signal.dispatch(111);

        expect(spy).toBeCalledTimes(1);
        expect(spy).toBeCalledWith(111);
    });

    it('default checkToEqualFunction', () => {
        const spy = vi.fn();

        const signal = new Signal(0);

        signal.subscribe(spy);

        signal.dispatch(0);

        signal.dispatch(111);

        signal.dispatch(222);

        expect(signal.getValue()).toEqual(222);

        expect(spy).toBeCalledTimes(2);
        expect(spy).nthCalledWith(1, 111);
        expect(spy).nthCalledWith(2, 222);
    });

    it('should use custom checkToEqualFunction (odd/even numbers)', () => {
        const spy = vi.fn();

        const signal = new Signal(0, (a, b) => a % 2 === b % 2);

        expect(signal.getValue()).toEqual(0);

        signal.subscribe(spy);

        signal.dispatch(1);
        expect(spy).nthCalledWith(1, 1);
        expect(signal.getValue()).toEqual(1);

        // is odd again, callbacks should not be dispatched
        signal.dispatch(3);
        expect(spy).toBeCalledTimes(1);
        expect(signal.getValue()).toEqual(1);

        // now even, dispatch callbacks
        signal.dispatch(2);
        expect(spy).nthCalledWith(2, 2);
        expect(signal.getValue()).toEqual(2);
    });

    it('should be able to unsubscribe functions)', () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();

        const signal = new Signal(0);

        expect(signal.getValue()).toEqual(0);

        const unsubscribeFirst = signal.subscribe(spy1);
        const unsubscribeSecond = signal.subscribe(spy2);

        signal.dispatch(1);
        expect(spy1).toBeCalledTimes(1);
        expect(spy1).nthCalledWith(1, 1);
        expect(spy2).toBeCalledTimes(1);
        expect(spy2).nthCalledWith(1, 1);

        signal.unsubscribe(spy1);
        signal.dispatch(2);
        expect(spy1).toBeCalledTimes(1);
        expect(spy2).toBeCalledTimes(2);
        expect(spy2).nthCalledWith(2, 2);

        unsubscribeFirst();

        signal.dispatch(3);
        expect(spy1).toBeCalledTimes(1);
        expect(spy2).toBeCalledTimes(3);

        unsubscribeSecond();

        signal.dispatch(4);
        expect(spy1).toBeCalledTimes(1);
        expect(spy2).toBeCalledTimes(3);
    });
});
