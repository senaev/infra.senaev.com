import { parallelLimit } from 'async';

import { PositiveInteger } from '../Number/PositiveInteger';

export function parallelsLimitPromise<T>(functions: (() => Promise<T>)[], limit: PositiveInteger): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
        parallelLimit<T>(
            functions.map((asyncFunction) => (callback) => {
                asyncFunction()
                    .then((result) => {
                        callback(null, result);
                    })
                    .catch((error) => {
                        callback(error);
                    });
            }),
            limit,
            (error, result) => {
                if (error) {
                    error.message = `parallelsLimitPromise error=[${error.message}]`;
                    reject(error);
                } else {
                    resolve(result as T[]);
                }
            }
        );
    });
}
