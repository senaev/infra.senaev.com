import { assertPositiveInteger, PositiveInteger } from '../../types/Number/PositiveInteger';

export type TimescaleRequestWindow<T> = {
    getNextObjects: (count: PositiveInteger) => Promise<{
        objects: T[];
        isLast: boolean;
    }>;
    getWindow: () => T[];
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
    maxWindowSize,
    minObjectsToLoad,
    loadNextObjects,
}: {
    /**
     * How much objects we can keep in the memory.
     */
    maxWindowSize: PositiveInteger;
    /**
     * Required for data loading efficiency, when the client requests small portions of data, but we want load data in larger chunks.
     */
    minObjectsToLoad: PositiveInteger;
    /**
     * The method for requesting data from local buffer or from server.
     */
    loadNextObjects: TimescaleRequestWindowLoadNextObjectsFunction<T>;
}): TimescaleRequestWindow<T> {
    if (minObjectsToLoad > maxWindowSize / 2) {
        throw new Error('minObjectsToLoad must be less than half of maxWindowSize');
    }

    let currentPosition = 0;
    const buffer: T[] = [];
    let isEndReached = false;

    const getObjectsFromBuffer = (requestedCount: PositiveInteger): T[] => {
        const items = buffer.slice(currentPosition, currentPosition + requestedCount);

        currentPosition += requestedCount;

        return items;
    };

    const removeOldItems = (count: PositiveInteger): void => {
        buffer.splice(0, count);
        currentPosition -= count;
    };

    const timescaleWindow: TimescaleRequestWindow<T> = {
        getNextObjects: async (requestedCount) => {
            assertPositiveInteger(requestedCount);

            const remainingItemsNeeded = currentPosition + requestedCount - buffer.length;

            if (remainingItemsNeeded <= 0 || isEndReached) {
                return {
                    objects: getObjectsFromBuffer(requestedCount),
                    isLast: isEndReached && remainingItemsNeeded >= 0,
                };
            }

            const batchSize = Math.max(minObjectsToLoad, remainingItemsNeeded);
            const lastItem = buffer.at(-1);
            const { isLast, objects: newItems } = await loadNextObjects({
                count: batchSize,
                lastObject: lastItem,
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

            buffer.push(...newItems);

            const result = {
                objects: getObjectsFromBuffer(itemsToReturn),
                isLast: isEndReached && currentPosition === buffer.length,
            };

            const itemsToRemove = Math.max(0, buffer.length - maxWindowSize);

            if (itemsToRemove > 0) {
                removeOldItems(itemsToRemove);
            }

            return result;
        },
        getWindow: () => buffer,
    };

    return timescaleWindow;
}
