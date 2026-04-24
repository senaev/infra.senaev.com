import { Signal } from '../Signal';

export type CombineSignalsIntoNewOneResult<T> = {
    signal: Signal<T>;
    teardown: VoidFunction;
};

export function combineSignalsIntoNewOne<T, A, B, C, D, E, F, G>(
    signals: [Signal<A>, Signal<B>, Signal<C>, Signal<D>, Signal<E>, Signal<F>, Signal<G>],
    combinator: (a: A, b: B, c: C, d: D, e: E, f: F, g: G) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean,
): CombineSignalsIntoNewOneResult<T>;

export function combineSignalsIntoNewOne<T, A, B, C, D, E, F>(
    signals: [Signal<A>, Signal<B>, Signal<C>, Signal<D>, Signal<E>, Signal<F>],
    combinator: (a: A, b: B, c: C, d: D, e: E, f: F) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean,
): CombineSignalsIntoNewOneResult<T>;

export function combineSignalsIntoNewOne<T, A, B, C, D, E>(
    signals: [Signal<A>, Signal<B>, Signal<C>, Signal<D>, Signal<E>],
    combinator: (a: A, b: B, c: C, d: D, e: E) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean,
): CombineSignalsIntoNewOneResult<T>;

export function combineSignalsIntoNewOne<T, A, B, C, D>(
    signals: [Signal<A>, Signal<B>, Signal<C>, Signal<D>],
    combinator: (a: A, b: B, c: C, d: D) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean,
): CombineSignalsIntoNewOneResult<T>;

export function combineSignalsIntoNewOne<T, A, B, C>(
    signals: [Signal<A>, Signal<B>, Signal<C>],
    combinator: (a: A, b: B, c: C) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean,
): CombineSignalsIntoNewOneResult<T>;

export function combineSignalsIntoNewOne<T, A, B>(
    signals: [Signal<A>, Signal<B>],
    combinator: (a: A, b: B) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean,
): CombineSignalsIntoNewOneResult<T>;

export function combineSignalsIntoNewOne<T, A>(
    signals: [Signal<A>],
    combinator: (a: A) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean,
): CombineSignalsIntoNewOneResult<T>;

export function combineSignalsIntoNewOne<T>(
    signals: Signal<unknown>[],
    combinator: (...args: unknown[]) => T,
    checkToEqualFunction?: (currentValue: T, nextValue: T) => boolean
): CombineSignalsIntoNewOneResult<T> {
    const getAllValues = () => signals.map((signal) => signal.getValue());

    const initialValue = combinator(...getAllValues());
    const combinedSignal = new Signal(initialValue, checkToEqualFunction);

    const unsubscribeFunctions: VoidFunction[] = signals.map((signal) =>
        signal.subscribe(() => {
            const nextValue = combinator(...getAllValues());

            combinedSignal.dispatch(nextValue);
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
