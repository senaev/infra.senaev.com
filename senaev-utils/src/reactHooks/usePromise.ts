import { useEffect, useState } from 'react';

export type UsePromiseResult<T> =
    | undefined
    | {
        data: T;
    }
    | {
        error: unknown;
    };

export function usePromise<T>(promise: Promise<T>): UsePromiseResult<T> {
    const [
        result,
        setResult,
    ] = useState<UsePromiseResult<T>>(undefined);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResult(undefined);

        promise.then((data) => {
            setResult({ data });
        }).catch((error) => {
            setResult({ error });
        });
    }, [promise]);

    return result;
}
