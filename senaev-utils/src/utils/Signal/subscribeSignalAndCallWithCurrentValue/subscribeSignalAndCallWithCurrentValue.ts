import { Signal } from '../Signal';

export function subscribeSignalAndCallWithCurrentValue<T>(signal: Signal<T>, callback: (value: T) => void): VoidFunction {
    callback(signal.getValue());

    return signal.subscribe(callback);
}
