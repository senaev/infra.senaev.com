import { Signal } from '../Signal';

export function subscribeSignalAndCallWithCurrentValue<T>(signal: Signal<T>, callback: (value: T) => void): VoidFunction {
    callback(signal.value());

    return signal.subscribe(callback);
}
