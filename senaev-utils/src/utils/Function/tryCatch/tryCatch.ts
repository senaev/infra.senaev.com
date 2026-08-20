import { AnyFunction } from '../../../types/any/AnyFunction';

export function tryCatch<T extends AnyFunction>(fn: T, onError?: (e: Error) => void): ReturnType<T> | undefined {
    try {
        return fn();
    } catch (e) {
        if (typeof onError === 'function') {
            onError(e as Error);
        }
    }

    return undefined;
}
