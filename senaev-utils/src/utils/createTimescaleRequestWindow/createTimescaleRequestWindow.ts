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
    let isEndReached = false;
    let lastItemPushed: T | undefined = undefined;

    const getObjectsFromBuffer = (count: PositiveInteger): T[] => {
        const items: T[] = [];

        for (let i = 0; i < count; i++) {
            const item = buffer.shift()!;

            items.push(item);
        }

        return items;
    };

    const timescaleWindow: TimescaleRequestWindow<T> = {
        getNextObjects: async (requestedCount) => {
            assertPositiveInteger(requestedCount);

            const remainingItemsNeeded = requestedCount - buffer.length;

            if (remainingItemsNeeded <= 0 || isEndReached) {
                return {
                    objects: getObjectsFromBuffer(Math.min(requestedCount, buffer.length)),
                    isLast: isEndReached && remainingItemsNeeded >= 0,
                };
            }

            const batchSize = Math.max(minObjectsToLoad, remainingItemsNeeded);

            const { isLast, objects: newItems } = await loadNextObjects({
                count: batchSize,
                lastObject: lastItemPushed,
            });

            let itemsToReturn = requestedCount;

            if (isLast) {
                isEndReached = true;
                const surplus = newItems.length - remainingItemsNeeded;

                if (surplus < 0) {
                    itemsToReturn += surplus;
                }
            } else if (newItems.length !== batchSize) {
                throw new Error(`loadNextObjects for isLast=false returned wrong objects count=[${newItems.length}] expected=[${batchSize}]`);
            }

            for (const item of newItems) {
                buffer.push(item);
                lastItemPushed = item;
            }

            const result: TimescaleRequestWindowLoadNextObjectsReturnType<T> = {
                objects: getObjectsFromBuffer(itemsToReturn),
                isLast: isEndReached && buffer.length === 0,
            };

            return result;
        },
    };

    return timescaleWindow;
}
