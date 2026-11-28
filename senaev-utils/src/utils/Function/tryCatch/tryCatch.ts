import { isFunction } from '../isFunction';
import { AnyFunction } from '../../../types/any/AnyFunction';

export function tryCatch<T extends AnyFunction>(fn: T, onError?: (e: Error) => void): ReturnType<T> | undefined {
    try {
        return fn();
    } catch (e) {
        if (isFunction(onError)) {
            onError(e as Error);
        }
    }

    return undefined;
}
