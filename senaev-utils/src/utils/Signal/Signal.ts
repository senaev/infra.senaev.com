import { SignalCallback } from './SignalCallback';

/**
 * EventEmitter with consistent value, alternative to BehaviorSubject from RxJS
 *
 * This class has been designed on a base of SolidJS reactive signal pattern https://www.solidjs.com/docs/latest/api#createsignal
 * and signal-js EventEmitter library https://www.npmjs.com/package/signal-js
 *
 * Allows to create and combine business logic into reactive Signals and use them in React.context via useSignal hook
 */
export class Signal<T> {
    private readonly callbacks: Set<SignalCallback<T>> = new Set<SignalCallback<T>>();

    public constructor(
        private _value: T,
        private readonly checkToEqualFunction: (currentValue: T, nextValue: T) => boolean = (currentValue, nextValue) =>
            currentValue === nextValue
    ) { }

    public value(): T {
        return this._value;
    }

    public subscribe(callback: SignalCallback<T>): VoidFunction {
        this.callbacks.add(callback);

        return () => {
            this.unsubscribe(callback);
        };
    }

    public next(nextValue: T): void {
        if (this.checkToEqualFunction(this._value, nextValue)) {
            return;
        }

        this._value = nextValue;

        for (const callback of this.callbacks.values()) {
            callback(nextValue);
        }
    }

    public unsubscribe(callback: SignalCallback<T>): void {
        this.callbacks.delete(callback);
    }
}
