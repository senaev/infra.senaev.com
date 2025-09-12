import { UnsignedInteger } from '../../types/Number/UnsignedInteger';

export type SimultaneousOperationsHandlerParams<T> = {
    index: UnsignedInteger;
    param: T;
};

export type SimultaneousOperationsHandlerParamsWithResult<T, R> = {
    paramsList: SimultaneousOperationsHandlerParams<T>[];
    result: R;
};

export type SimultaneousOperationCall<T, R> = {
    param: T;
    resolve: (result: SimultaneousOperationsHandlerParamsWithResult<T, R>) => void;
    reject: (error: Error) => void;
};

export function createSimultaneousOperationsHandler<T, R>(callback: (syncParamsToCall: SimultaneousOperationsHandlerParams<T>[]) => R): (
    param: T,
    index: UnsignedInteger
) => Promise<SimultaneousOperationsHandlerParamsWithResult<T, R>> {
    let expectedNextIndex: UnsignedInteger = 0;
    const queuedOperationsStore = new Map<UnsignedInteger, SimultaneousOperationCall<T, R>>();

    return (param: T, index: UnsignedInteger): Promise<SimultaneousOperationsHandlerParamsWithResult<T, R>> => {
        const promise = new Promise<SimultaneousOperationsHandlerParamsWithResult<T, R>>((resolve, reject) => {
            queuedOperationsStore.set(index, {
                param,
                resolve,
                reject,
            });
        });

        const syncParamsToCall: SimultaneousOperationsHandlerParams<T>[] = [];
        const operationCalls: SimultaneousOperationCall<T, R>[] = [];

        while (queuedOperationsStore.has(expectedNextIndex)) {
            const nextOperation = queuedOperationsStore.get(expectedNextIndex)!;

            syncParamsToCall.push({
                index: expectedNextIndex,
                param: nextOperation.param,
            });

            operationCalls.push(nextOperation);

            queuedOperationsStore.delete(expectedNextIndex);
            expectedNextIndex++;
        }

        if (syncParamsToCall.length > 0) {
            const result = callback(syncParamsToCall);

            for (const operation of operationCalls) {
                operation.resolve({
                    paramsList: syncParamsToCall,
                    result,
                });
            }
        }

        return promise;
    };
}
