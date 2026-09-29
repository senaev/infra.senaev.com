import { SubscribableValue } from '../../../types/SubscribableValue';
import { Latch } from '../../Latch/Latch';
import { Signal } from '../Signal';

export type CombineSignalsIntoNewOneResult<T> = {
    signal: Signal<T>;
    teardown: VoidFunction;
};

/**
 * The value that a source passes to the combinator
 *
 * A Signal always has a value, a Latch has no value before dispatch,
 * so the Latch position is widened to `T | undefined`
 */
type CombineSourceValue<S> = S extends Signal<infer T>
    ? T
    : S extends Latch<infer T>
        ? T | undefined
        : S extends SubscribableValue<infer T>
            ? T | undefined
            : never;

type CombineSourceValues<S extends readonly SubscribableValue<unknown>[]> = {
    [K in keyof S]: CombineSourceValue<S[K]>;
};

/**
 * Collects the values of several Signals and Latches into one derived Signal
 *
 * A Latch that was not dispatched yet passes `undefined` to the combinator,
 * and after dispatch it stops affecting the result, because it fires only once
 */
export function combineSignalsIntoNewOne<const S extends readonly SubscribableValue<unknown>[], T>(
    sources: S,
    combinator: (...values: CombineSourceValues<S>) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean
): CombineSignalsIntoNewOneResult<T> {
    const getAllValues = () => sources.map((source) => source.getValue()) as CombineSourceValues<S>;

    const combinedSignal = new Signal(combinator(...getAllValues()), checkToEqualFunction);

    const unsubscribeFunctions: VoidFunction[] = sources.map((source) =>
        source.subscribe(() => {
            combinedSignal.dispatch(combinator(...getAllValues()));
        }));

    return {
        signal: combinedSignal,
        teardown() {
            unsubscribeFunctions.forEach((unsubscribeFunction) => {
                unsubscribeFunction();
            });
        },
    };
}
