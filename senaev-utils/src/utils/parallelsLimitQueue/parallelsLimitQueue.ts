import { PositiveInteger } from '../../types/Number/PositiveInteger';
import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { isPromise } from '../isPromise/isPromise';

export function parallelsLimitQueue<T, R>({
    callback,
    limit,
}: {
    callback: (param: T) => R | Promise<R>;
    limit: PositiveInteger;
}): (param: T) => Promise<R> {
    let operationsRunning: UnsignedInteger = 0;
    const queue: {
        param: T;
        resolve: (result: R) => void;
        reject: (error: Error) => void;
    }[] = [];

    async function runOperations() {
        if (operationsRunning >= limit) {
            return;
        }

        const operation = queue.shift();

        if (!operation) {
            return;
        }

        const {
            param,
            resolve,
            reject,
        } = operation;

        operationsRunning++;

        try {
            const resultValue = callback(param);

            if (isPromise(resultValue)) {
                const result = await resultValue;

                resolve(result);
            } else {
                resolve(resultValue);
            }
        } catch (error) {
            reject(error as Error);
        } finally {
            operationsRunning--;
            runOperations();
        }
    }

    return (param: T) => {
        const promise = new Promise<R>((resolve, reject) => {
            queue.push({
                param,
                resolve,
                reject,
            });
        });

        runOperations();

        return promise;
    };
}
