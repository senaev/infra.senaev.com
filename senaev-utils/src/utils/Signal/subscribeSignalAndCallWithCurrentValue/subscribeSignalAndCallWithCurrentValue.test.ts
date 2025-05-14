import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { Signal } from '../Signal';

import { subscribeSignalAndCallWithCurrentValue } from './subscribeSignalAndCallWithCurrentValue';

describe('subscribeSignalAndCallWithCurrentValue', () => {
    it('should call callback with current value immediately', () => {
        const spy = vi.fn();
        const signal = new Signal(42);

        subscribeSignalAndCallWithCurrentValue(signal, spy);

        expect(spy).toBeCalledTimes(1);
        expect(spy).toBeCalledWith(42);
    });

    it('should subscribe to future signal updates', () => {
        const spy = vi.fn();
        const signal = new Signal(42);

        const unsubscribe = subscribeSignalAndCallWithCurrentValue(signal, spy);

        // Initial call
        expect(spy).toBeCalledTimes(1);
        expect(spy).toBeCalledWith(42);

        // Future updates
        signal.next(100);
        expect(spy).toBeCalledTimes(2);
        expect(spy).toBeCalledWith(100);

        // Unsubscribe should work
        unsubscribe();
        signal.next(200);
        expect(spy).toBeCalledTimes(2); // Should not be called again
    });

    it('should handle multiple subscriptions and unsubscriptions', () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        const signal = new Signal(42);

        const unsubscribe1 = subscribeSignalAndCallWithCurrentValue(signal, spy1);
        const unsubscribe2 = subscribeSignalAndCallWithCurrentValue(signal, spy2);

        // Both should be called with initial value
        expect(spy1).toBeCalledTimes(1);
        expect(spy1).toBeCalledWith(42);
        expect(spy2).toBeCalledTimes(1);
        expect(spy2).toBeCalledWith(42);

        // Both should receive updates
        signal.next(100);
        expect(spy1).toBeCalledTimes(2);
        expect(spy1).toBeCalledWith(100);
        expect(spy2).toBeCalledTimes(2);
        expect(spy2).toBeCalledWith(100);

        // Unsubscribe first spy
        unsubscribe1();
        signal.next(200);
        expect(spy1).toBeCalledTimes(2); // Should not be called again
        expect(spy2).toBeCalledTimes(3);
        expect(spy2).toBeCalledWith(200);

        // Unsubscribe second spy
        unsubscribe2();
        signal.next(300);
        expect(spy1).toBeCalledTimes(2); // Should not be called again
        expect(spy2).toBeCalledTimes(3); // Should not be called again
    });
});
