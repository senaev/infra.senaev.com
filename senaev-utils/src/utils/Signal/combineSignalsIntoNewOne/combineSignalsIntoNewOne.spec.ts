import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

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
});
