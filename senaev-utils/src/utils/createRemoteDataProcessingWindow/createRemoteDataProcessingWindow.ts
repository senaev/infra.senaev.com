import { assertPositiveInteger, PositiveInteger } from '../../types/Number/PositiveInteger';
import { CircularBuffer } from '../CircularBuffer/CircularBuffer';
import { noop } from '../Function/noop';
import { restrictParallelCalls } from '../Promise/restrictParallelCalls/restrictParallelCalls';

export type RemoteDataProcessingWindowLoadNextItemsReturnType<T> = {
    items: T[];
    isLast: boolean;
};
export type RemoteDataProcessingWindowExtractItemsFunction<T> = (requestedItemsCount: PositiveInteger) => Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>>;

export type RemoteDataProcessingWindowLoadNextItemsParams<T> = {
    lastItem: T | undefined;
    count: PositiveInteger;
};
export type RemoteDataProcessingWindowLoadNextItemsFunction<T> = (params: RemoteDataProcessingWindowLoadNextItemsParams<T>) => Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>>;

/**
 * The function receives a buffer size and a function for loading data from remote source
 *
 * The function is dedicated to fill the buffer in the beginning and every time when the client extracts data from it,
 * until the remote data is finished
 */
export function createRemoteDataProcessingWindow<T>({
    bufferSize,
    loadNextItems,
}: {
    /**
     * The size of the buffer (how many items are kept in the memory)
     */
    bufferSize: PositiveInteger;
    /**
     * The method for requesting data from local buffer or from server.
     */
    loadNextItems: RemoteDataProcessingWindowLoadNextItemsFunction<T>;
}): RemoteDataProcessingWindowExtractItemsFunction<T> {
    const buffer = new CircularBuffer<T>(bufferSize);

    let isRemoteDataFinished = false;
    let lastItemPushedToBuffer: T | undefined = undefined;

    let processingCallback: VoidFunction = noop;

    // One error is enough to stop the whole process
    let error: {
        error: Error;
    } | undefined = undefined;

    let isRequestInProgress = false;

    async function requestRemoteItemsToFillBuffer() {
        if (isRequestInProgress || isRemoteDataFinished) {
            return;
        }

        const countToLoad = bufferSize - buffer.length;

        if (countToLoad === 0) {
            return;
        }

        isRequestInProgress = true;

        try {
            const { isLast, items } = await loadNextItems({
                count: countToLoad,
                lastItem: lastItemPushedToBuffer,
            });

            isRequestInProgress = false;

            if (isLast) {
                isRemoteDataFinished = true;
            } else if (items.length !== countToLoad) {
                throw new Error(`loadNextItems for isLast=false returned wrong items count=[${items.length}] expected=[${countToLoad}]`);
            }

            for (const item of items) {
                buffer.push(item);
            }

            lastItemPushedToBuffer = items.at(-1);

            requestRemoteItemsToFillBuffer();
        } catch (e) {
            isRequestInProgress = false;
            error = {
                error: e as Error,
            };
        } finally {
            processingCallback();
        }
    }

    requestRemoteItemsToFillBuffer();

    // eslint-disable-next-line require-await
    return restrictParallelCalls(async (requestedItemsCount): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>> => {
        if (error) {
            throw error.error;
        }

        assertPositiveInteger(requestedItemsCount);

        if (requestedItemsCount > bufferSize) {
            throw new Error(`requestedItemsCount=[${requestedItemsCount}] must be less than bufferSize=[${bufferSize}]`);
        }

        // Has enough items to extract
        if (buffer.length >= requestedItemsCount) {
            const items = buffer.shiftCount(requestedItemsCount);

            requestRemoteItemsToFillBuffer();

            return {
                items,
                isLast: isRemoteDataFinished && buffer.length === 0,
            };
        }

        // No more data in remote, nothing to wait
        if (isRemoteDataFinished) {
            const items = buffer.shiftCount(requestedItemsCount);

            return {
                items,
                isLast: buffer.length === 0,
            };
        }

        return new Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>>((resolve, reject) => {
            processingCallback = () => {
                if (error) {
                    reject(error.error);

                    return;
                }

                if (buffer.length < requestedItemsCount) {
                    return;
                }

                processingCallback = noop;

                const items = buffer.shiftCount(requestedItemsCount);
                const isLast = isRemoteDataFinished && buffer.length === 0;

                requestRemoteItemsToFillBuffer();

                resolve({
                    items,
                    isLast,
                });
            };
        });
    }, 'createRemoteDataProcessingWindow');
}
