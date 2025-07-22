import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function retryFunctionWrapper<T extends (...args: any[]) => any>({
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
                    const fnReturnValue = fn(...args);

                    const result = await fnReturnValue as ReturnType<T>;

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
