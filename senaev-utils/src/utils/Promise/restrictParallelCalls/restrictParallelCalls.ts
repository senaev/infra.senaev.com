import { AnyAsyncFunction } from '../../../types/any/AnyAsyncFunction';

export function restrictParallelCalls<T extends AnyAsyncFunction>(callback: T, errorMessage?: string): T {
    let isRunning = false;

    return ((...args: Parameters<T>) => {
        if (isRunning) {
            throw new Error(`restrictParallelCalls${errorMessage ? ` errorMessage=[${errorMessage}]` : ''} previous call is not finished, do not call function in parallel`);
        }

        isRunning = true;
        const promise = callback(...args);

        return promise.finally(() => {
            isRunning = false;
        });
    }) as T;
}
