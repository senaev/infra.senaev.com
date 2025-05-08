import { callFunctions } from '../Function/callFunctions/callFunctions';
import { isFunction } from '../Function/isFunction';
import { noop } from '../Function/noop';
import { once } from '../Function/once/once';

export type LatchCallback<T> = (parameter: T) => void;

/**
 * Класс, инстанс которого хранит неизменяемое значение и может находиться в двух состояниях
 * - значение не задано
 * - значение задано
 *
 * Если значение не задано, подписаться на его установку можно с помощью метода subscribe,
 * а установить значение вызвав метод dispatch
 *
 * В случае, если значение задано, при вызове метода subscribe callback отрабатывает сразу,
 * а дальнейшие вызовы dispatch игнорируются
 */
export class Latch<T = undefined> {
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
