import { isPromise } from '../isPromise/isPromise';

/**
 * Creates a wrapper that ensures async function calls are executed sequentially
 * even when called simultaneously. Maintains order of execution by using a queue.
 *
 * @param callback The async function to be wrapped
 * @returns A function that queues and executes the async operations sequentially
 */
export function makeAsyncFunctionCallsSimultaneous<T, R>(callback: (param: T) => (R | Promise<R>)): (param: T) => Promise<R> {
    let isAsyncOperationRunning = false;
    const operationsQueue: {
        resolve: (value: R) => void;
        reject: (error: Error) => void;
        param: T;
    }[] = [];

    function runAsyncOperations() {
        isAsyncOperationRunning = true;

        const operation = operationsQueue.shift();

        if (!operation) {
            isAsyncOperationRunning = false;
            return;
        }

        try {
            const returnValue = callback(operation.param);

            if (isPromise(returnValue)) {
                returnValue
                    .then(operation.resolve)
                    .catch(operation.reject)
                    .finally(runAsyncOperations);
            } else {
                operation.resolve(returnValue);
                runAsyncOperations();
            }
        } catch (error) {
            operation.reject(error as Error);
            runAsyncOperations();
        }
    }

    return (param: T): Promise<R> => {
        const promise = new Promise<R>((resolve, reject) => {
            operationsQueue.push({
                resolve,
                reject,
                param,
            });
        });

        if (isAsyncOperationRunning) {
            return promise;
        }

        runAsyncOperations();

        return promise;
    };
}
