import type { UsePromiseResult } from '../../../reactHooks/usePromise';
import { Latch } from '../Latch';

export function promiseToLatch<T>(promise: Promise<T>): Latch<UsePromiseResult<T>> {
    const latch = new Latch<UsePromiseResult<T>>();

    promise
        .then((data) => {
            latch.dispatch({ data });
        })
        .catch((error: unknown) => {
            latch.dispatch({ error });
        });

    return latch;
}
