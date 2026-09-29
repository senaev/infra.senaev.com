import { SubscribableValue } from '../../types/SubscribableValue';
import { callFunctions } from '../Function/callFunctions/callFunctions';
import { isFunction } from '../Function/isFunction';
import { noop } from '../Function/noop';
import { once } from '../Function/once/once';

export type LatchCallback<T> = (parameter: T) => void;

/**
 * A class whose instance holds an immutable value and can be in one of two states
 * - the value is not set
 * - the value is set
 *
 * If the value is not set, you can subscribe to it being set with the subscribe method,
 * and set the value by calling the dispatch method
 *
 * If the value is set, the callback passed to subscribe runs immediately,
 * and further dispatch calls are ignored
 */
export class Latch<T = undefined> implements SubscribableValue<T> {
    public dispatch = once((value: T): void => {
        this.value = value;
        this._isDispatched = true;

        callFunctions(this.callbacks, value);
        this.callbacks.clear();
    });

    private readonly callbacks: Set<LatchCallback<T>> = new Set();
    private _isDispatched = false;
    private value?: T;

    public constructor(callback?: LatchCallback<T>) {
        if (isFunction(callback)) {
            this.callbacks.add(callback);
        }
    }

    public subscribe(callback: LatchCallback<T>): VoidFunction {
        if (this._isDispatched) {
            callback(this.value!);

            return noop;
        }

        this.callbacks.add(callback);

        return () => {
            this.callbacks.delete(callback);
        };
    }

    public unsubscribe(callback: LatchCallback<T>): void {
        this.callbacks.delete(callback);
    }

    public isDispatched(): boolean {
        return this._isDispatched;
    }

    public getValue(): T | undefined {
        return this.value;
    }
}
