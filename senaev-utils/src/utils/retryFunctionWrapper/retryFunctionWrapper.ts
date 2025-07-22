import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

export function retryFunctionWrapper<T extends (...args: unknown[]) => Promise<unknown>>({
    fn,
    attempts,
    delay,
    onFailAttempt,
}: {
    fn: T;
    attempts: number;
    delay: number;
    onFailAttempt?: (error: unknown, attemptIndex: number) => void;
}): T {
    return ((...args: Parameters<T>): Promise<ReturnType<T>> => {
        const mainPromise = new Promise<ReturnType<T>>((resolve, reject) => {
            let attemptIndex = 0;
            const makeAttempt = async () => {
                try {
                    const attemptPromise = fn(...args);

                    const result = await attemptPromise as ReturnType<T>;

                    resolve(result);
                } catch (error) {
                    onFailAttempt?.(error, attemptIndex);
                    attemptIndex++;

                    if (attemptIndex < attempts) {
                        promiseTimeout(delay).then(makeAttempt);
                    } else {
                        // eslint-disable-next-line prefer-promise-reject-errors
                        reject(error as Error);
                    }
                }
            };

            makeAttempt();
        });

        return mainPromise;
    }) as T;
}
