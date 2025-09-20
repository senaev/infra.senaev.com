import { assertPositiveInteger, PositiveInteger } from '../../types/Number/PositiveInteger';
import { CircularBuffer } from '../CircularBuffer/CircularBuffer';

export type RemoteDataProcessingWindowLoadNextItemsReturnType<T> = {
    items: T[];
    isLast: boolean;
};
export type RemoteDataProcessingWindow<T> = {
    getNextItems: (requestedItemsCount: PositiveInteger) => Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>>;
};
export type RemoteDataProcessingWindowLoadNextItemsParams<T> = {
    lastItem: T | undefined;
    count: PositiveInteger;
};
export type RemoteDataProcessingWindowLoadNextItemsFunction<T> = (params: RemoteDataProcessingWindowLoadNextItemsParams<T>) => Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>>;

export function createRemoteDataProcessingWindow<T>({
    bufferSize,
    minItemsToLoad,
    loadNextItems,
}: {
    /**
     * How much objects we can keep in the memory.
     */
    bufferSize: PositiveInteger;
    /**
     * Required for data loading efficiency, when the client requests small portions of data, but we want load data in larger chunks.
     */
    minItemsToLoad: PositiveInteger;
    /**
     * The method for requesting data from local buffer or from server.
     */
    loadNextItems: RemoteDataProcessingWindowLoadNextItemsFunction<T>;
}): RemoteDataProcessingWindow<T> {
    if (minItemsToLoad > bufferSize / 2) {
        throw new Error('minItemsToLoad must be less than half of maxWindowSize');
    }

    const buffer = new CircularBuffer<T>(bufferSize);
    let isRemoteDataFinished = false;
    let lastItemPushed: T | undefined = undefined;

    const timescaleWindow: RemoteDataProcessingWindow<T> = {
        getNextItems: async (requestedItemsCount) => {
            assertPositiveInteger(requestedItemsCount);

            if (requestedItemsCount > bufferSize) {
                throw new Error(`requestedItemsCount=[${requestedItemsCount}] must be less than bufferSize=[${bufferSize}]`);
            }

            const remainingItemsNeeded = requestedItemsCount - buffer.length;

            if (remainingItemsNeeded <= 0 || isRemoteDataFinished) {
                return {
                    items: buffer.shiftCount(Math.min(requestedItemsCount, buffer.length)),
                    isLast: isRemoteDataFinished && remainingItemsNeeded >= 0,
                };
            }

            const countToLoad = Math.max(minItemsToLoad, remainingItemsNeeded);

            const { isLast, items } = await loadNextItems({
                count: countToLoad,
                lastItem: lastItemPushed,
            });

            if (isLast) {
                isRemoteDataFinished = true;
            } else if (items.length !== countToLoad) {
                throw new Error(`loadNextItems for isLast=false returned wrong items count=[${items.length}] expected=[${countToLoad}]`);
            }

            for (const item of items) {
                buffer.push(item);
            }

            lastItemPushed = items.at(-1);

            const result: RemoteDataProcessingWindowLoadNextItemsReturnType<T> = {
                items: buffer.shiftCount(requestedItemsCount),
                isLast: isRemoteDataFinished && buffer.length === 0,
            };

            return result;
        },
    };

    return timescaleWindow;
}
