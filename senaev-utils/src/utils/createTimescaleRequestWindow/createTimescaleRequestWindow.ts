import { assertPositiveInteger, PositiveInteger } from '../../types/Number/PositiveInteger';
import { CircularBuffer } from '../CircularBuffer/CircularBuffer';

export type TimescaleRequestWindow<T> = {
    getNextObjects: (count: PositiveInteger) => Promise<{
        objects: T[];
        isLast: boolean;
    }>;
};
export type TimescaleRequestWindowLoadNextObjectsParams<T> = {
    lastObject: T | undefined;
    count: PositiveInteger;
};
export type TimescaleRequestWindowLoadNextObjectsReturnType<T> = {
    objects: T[];
    isLast: boolean;
};
export type TimescaleRequestWindowLoadNextObjectsFunction<T> = (params: TimescaleRequestWindowLoadNextObjectsParams<T>) => Promise<TimescaleRequestWindowLoadNextObjectsReturnType<T>>;

export function createTimescaleRequestWindow<T>({
    bufferSize,
    minObjectsToLoad,
    loadNextObjects,
}: {
    /**
     * How much objects we can keep in the memory.
     */
    bufferSize: PositiveInteger;
    /**
     * Required for data loading efficiency, when the client requests small portions of data, but we want load data in larger chunks.
     */
    minObjectsToLoad: PositiveInteger;
    /**
     * The method for requesting data from local buffer or from server.
     */
    loadNextObjects: TimescaleRequestWindowLoadNextObjectsFunction<T>;
}): TimescaleRequestWindow<T> {
    if (minObjectsToLoad > bufferSize / 2) {
        throw new Error('minObjectsToLoad must be less than half of maxWindowSize');
    }

    const buffer = new CircularBuffer<T>(bufferSize);
    let isRemoteDataFinished = false;
    let lastItemPushed: T | undefined = undefined;

    const timescaleWindow: TimescaleRequestWindow<T> = {
        getNextObjects: async (requestedCount) => {
            assertPositiveInteger(requestedCount);

            if (requestedCount > bufferSize) {
                throw new Error(`requestedCount=[${requestedCount}] must be less than bufferSize=[${bufferSize}]`);
            }

            const remainingItemsNeeded = requestedCount - buffer.length;

            if (remainingItemsNeeded <= 0 || isRemoteDataFinished) {
                return {
                    objects: buffer.shiftCount(Math.min(requestedCount, buffer.length)),
                    isLast: isRemoteDataFinished && remainingItemsNeeded >= 0,
                };
            }

            const countToLoad = Math.max(minObjectsToLoad, remainingItemsNeeded);

            const { isLast, objects } = await loadNextObjects({
                count: countToLoad,
                lastObject: lastItemPushed,
            });

            if (isLast) {
                isRemoteDataFinished = true;
            } else if (objects.length !== countToLoad) {
                throw new Error(`loadNextObjects for isLast=false returned wrong objects count=[${objects.length}] expected=[${countToLoad}]`);
            }

            for (const item of objects) {
                buffer.push(item);
            }

            lastItemPushed = objects.at(-1);

            const result: TimescaleRequestWindowLoadNextObjectsReturnType<T> = {
                objects: buffer.shiftCount(requestedCount),
                isLast: isRemoteDataFinished && buffer.length === 0,
            };

            return result;
        },
    };

    return timescaleWindow;
}
