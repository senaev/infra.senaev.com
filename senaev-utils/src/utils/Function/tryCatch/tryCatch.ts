import { AnyFunction } from '../../../types/AnyFunction';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tryCatch<T extends AnyFunction>(fn: T, onError?: (e: Error) => any): ReturnType<T> | undefined {
    try {
        return fn();
    } catch (e) {
        if (typeof onError === 'function') {
            onError(e as Error);
        }
    }

    return undefined;
}
