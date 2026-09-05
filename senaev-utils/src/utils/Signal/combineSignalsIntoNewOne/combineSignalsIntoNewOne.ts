import { SubscribableValue } from '../../../types/SubscribableValue';
import { Latch } from '../../Latch/Latch';
import { Signal } from '../Signal';

export type CombineSignalsIntoNewOneResult<T> = {
    signal: Signal<T>;
    teardown: VoidFunction;
};

/**
 * Значение, которое источник передаёт в комбинатор
 *
 * У Signal значение есть всегда, у Latch до dispatch его нет,
 * поэтому позиция Latch расширяется до `T | undefined`
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
 * Собирает значения нескольких Signal и Latch в один производный Signal
 *
 * Latch, по которому ещё не было dispatch, передаёт в комбинатор `undefined`,
 * а после dispatch перестаёт влиять на результат, потому что срабатывает один раз
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
