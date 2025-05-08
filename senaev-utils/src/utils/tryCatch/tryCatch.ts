import { AnyFunction } from '../../types/AnyFunction';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cb = (e: Error) => any;

export function tryCatch<T extends AnyFunction, E extends Cb>(fn: T, onError?: E): ReturnType<T> | void {
    try {
        return fn();
    } catch (e) {
        if (typeof onError === 'function') {
            onError(e as Error);
        }
    }
}
