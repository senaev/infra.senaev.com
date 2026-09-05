import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { IsEqualUnion } from '../../../types/IsEqualUnion';
import { ANY_VALUE } from '../../../types/assertions/ANY_VALUE';
import { isTrue } from '../../../types/assertions/isTrue/isTrue';
import { Latch } from '../../Latch/Latch';
import { deepEqual } from '../../Object/deepEqual/deepEqual';
import { Signal } from '../Signal';

import { combineSignalsIntoNewOne } from './combineSignalsIntoNewOne';

describe('combineSignalsIntoNewOne', () => {
    it('should combine value signal considering equality function', () => {
        const firstSignal = new Signal(1);
        const secondSignal = new Signal(2);
        const thirdSignal = new Signal(3);

        let equalityCheckerResult = false;
        const calls: unknown[] = [];
        const equalityChecker = (...args: unknown[]) => {
            calls.push([...args]);

            return equalityCheckerResult;
        };

        const { signal, teardown } = combineSignalsIntoNewOne(
            [
                firstSignal,
                secondSignal,
                thirdSignal,
            ],
            (a, b, c) => a + b + c,
            equalityChecker
        );

        expect(signal.getValue()).toEqual(6);
        expect(calls.length).toEqual(0);

        thirdSignal.dispatch(66);

        expect(signal.getValue()).toEqual(69);
        expect(calls).toEqual([
            [
                6,
                69,
            ],
        ]);

        equalityCheckerResult = true;

        firstSignal.dispatch(11);

        expect(signal.getValue()).toStrictEqual(69);
        expect(calls).toEqual([
            [
                6,
                69,
            ],
            [
                69,
                79,
            ],
        ]);

        equalityCheckerResult = false;

        firstSignal.dispatch(12);

        expect(signal.getValue()).toStrictEqual(80);
        expect(calls).toEqual([
            [
                6,
                69,
            ],
            [
                69,
                79,
            ],
            [
                69,
                80,
            ],
        ]);

        // После вызова teardown ничего не происходит
        teardown();
        firstSignal.dispatch(666);
        firstSignal.dispatch(666);

        expect(signal.getValue()).toStrictEqual(80);
        expect(calls).toEqual([
            [
                6,
                69,
            ],
            [
                69,
                79,
            ],
            [
                69,
                80,
            ],
        ]);
    });

    it('is able to combine only one signal', () => {
        const spy = vi.fn();
        const originalSignal = new Signal<number[]>([
            1,
            2,
            3,
            4,
            5,
        ], deepEqual);

        function isArraySumEven(arr: number[]) {
            return arr.reduce((prev, curr) => prev + curr, 0) % 2 === 0;
        }

        const { signal, teardown } = combineSignalsIntoNewOne([originalSignal], isArraySumEven);

        signal.subscribe(spy);

        expect(signal.getValue()).toEqual(false);
        expect(spy.mock.calls.length).toEqual(0);

        originalSignal.dispatch([
            1,
            2,
            3,
            4,
            5,
        ]);

        expect(signal.getValue()).toEqual(false);
        expect(spy.mock.calls.length).toEqual(0);

        originalSignal.dispatch([1]);

        expect(signal.getValue()).toEqual(false);
        expect(spy.mock.calls.length).toEqual(0);

        originalSignal.dispatch([
            1,
            2,
            3,
            4,
        ]);

        expect(signal.getValue()).toEqual(true);
        expect(spy.mock.calls.length).toEqual(1);

        teardown();

        originalSignal.dispatch([1]);

        expect(signal.getValue()).toEqual(true);
        expect(spy.mock.calls.length).toEqual(1);
    });

    it('should pass undefined into combinator for a latch that is not dispatched yet', () => {
        const spy = vi.fn();
        const numberSignal = new Signal(1);
        const stringLatch = new Latch<string>();

        const { signal, teardown } = combineSignalsIntoNewOne(
            [
                numberSignal,
                stringLatch,
            ],
            (a, b) => {
                isTrue(ANY_VALUE as IsEqualUnion<typeof a, number>);
                isTrue(ANY_VALUE as IsEqualUnion<typeof b, string | undefined>);

                return `${a}-${b ?? 'pending'}`;
            }
        );

        signal.subscribe(spy);

        expect(signal.getValue()).toEqual('1-pending');

        numberSignal.dispatch(2);

        expect(signal.getValue()).toEqual('2-pending');

        stringLatch.dispatch('ready');

        expect(signal.getValue()).toEqual('2-ready');
        expect(spy.mock.calls.length).toEqual(2);

        // Latch срабатывает один раз, дальнейшие dispatch игнорируются
        stringLatch.dispatch('again');

        expect(signal.getValue()).toEqual('2-ready');
        expect(spy.mock.calls.length).toEqual(2);

        teardown();

        numberSignal.dispatch(3);

        expect(signal.getValue()).toEqual('2-ready');
        expect(spy.mock.calls.length).toEqual(2);
    });

    it('should take the value of an already dispatched latch without emitting on setup', () => {
        const spy = vi.fn();
        const latch = new Latch<number>();

        latch.dispatch(41);

        const { signal } = combineSignalsIntoNewOne([latch], (a) => (a ?? 0) + 1);

        signal.subscribe(spy);

        expect(signal.getValue()).toEqual(42);
        expect(spy.mock.calls.length).toEqual(0);
    });

    it('should combine latches only', () => {
        const firstLatch = new Latch<number>();
        const secondLatch = new Latch<number>();

        const { signal } = combineSignalsIntoNewOne(
            [
                firstLatch,
                secondLatch,
            ],
            (a, b) => (a === undefined || b === undefined ? undefined : a + b)
        );

        expect(signal.getValue()).toEqual(undefined);

        firstLatch.dispatch(1);

        expect(signal.getValue()).toEqual(undefined);

        secondLatch.dispatch(2);

        expect(signal.getValue()).toEqual(3);
    });
});
