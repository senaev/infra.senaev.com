import {
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { Latch } from './Latch';

describe('Latch', () => {
    test('should call callbacks once and ignore latest dispatches', () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        const spy3 = vi.fn();
        const spy4 = vi.fn();

        const latch = new Latch<number>();

        expect(latch.isDispatched()).to.equal(false);

        latch.subscribe(spy1);
        latch.subscribe(spy2);
        latch.dispatch(111);

        expect(latch.isDispatched()).to.equal(true);
        expect(latch.getValue()).to.equal(111);

        expect(spy1.mock.calls).toEqual([[111]]);
        expect(spy2.mock.calls).toEqual([[111]]);
        expect(spy3.mock.calls).toEqual([]);
        expect(spy4.mock.calls).toEqual([]);

        latch.subscribe(spy3);
        latch.dispatch(222);

        expect(spy1.mock.calls).toEqual([[111]]);
        expect(spy2.mock.calls).toEqual([[111]]);
        expect(spy3.mock.calls).toEqual([[111]]);
        expect(spy4.mock.calls).toEqual([]);

        latch.subscribe(spy4);

        expect(spy1.mock.calls).toEqual([[111]]);
        expect(spy2.mock.calls).toEqual([[111]]);
        expect(spy3.mock.calls).toEqual([[111]]);
        expect(spy4.mock.calls).toEqual([[111]]);
        expect(latch.getValue()).to.equal(111);
    });

    test('should be able to unsubscribe event before dispatch', () => {
        const obj = {};

        const spy1 = vi.fn();
        const spy2 = vi.fn();

        const latch = new Latch<{}>();
        const unsubscribe = latch.subscribe(spy1);
        latch.subscribe(spy2);

        unsubscribe();

        expect(latch.isDispatched()).to.equal(false);

        latch.dispatch(obj);

        expect(latch.isDispatched()).to.equal(true);

        expect(spy1.mock.calls.length).toBe(0);
        expect(spy2.mock.calls.length).toBe(1);
        expect(spy2.mock.calls[0][0]).to.equal(obj);

        expect(latch.isDispatched()).to.equal(true);
        expect(latch.getValue()).to.equal(obj);
    });

    test('should handle latch with undefined', () => {
        const spy = vi.fn();
        const latch = new Latch();
        latch.subscribe(spy);

        expect(latch.isDispatched()).to.equal(false);
        expect(spy.mock.calls.length).toBe(0);

        latch.dispatch(undefined);

        expect(latch.isDispatched()).to.equal(true);
        expect(latch.getValue()).to.equal(undefined);
        expect(spy.mock.calls.length).toBe(1);
        expect(spy.mock.calls[0][0]).to.equal(undefined);
    });

    test('can pass callback into constructor', () => {
        const constructorCallback = vi.fn();
        const additionalCallback1 = vi.fn();
        const additionalCallback2 = vi.fn();
        const latch = new Latch<string>(constructorCallback);
        latch.subscribe(additionalCallback1);

        expect(constructorCallback.mock.calls.length).toBe(0);
        expect(additionalCallback1.mock.calls.length).toBe(0);
        expect(additionalCallback2.mock.calls.length).toBe(0);

        latch.dispatch('I\'m latching on to you');

        latch.subscribe(additionalCallback2);

        expect(constructorCallback.mock.calls).toEqual([['I\'m latching on to you']]);

        latch.dispatch('hello');

        expect(constructorCallback.mock.calls).toEqual([['I\'m latching on to you']]);
        expect(additionalCallback1.mock.calls).toEqual([['I\'m latching on to you']]);
        expect(additionalCallback2.mock.calls).toEqual([['I\'m latching on to you']]);
    });
});
