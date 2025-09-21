import { Subject } from 'rxjs';

import { assertPositiveInteger, PositiveInteger } from '../../types/Number/PositiveInteger';
import { CircularBuffer } from '../CircularBuffer/CircularBuffer';
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

    // ❗️ use callback variable as parallel calls are restricted
    const itemsPushedToBufferSubject = new Subject<Error | undefined>();

    // One error is enough to stop the whole process
    let error: Error | undefined = undefined;
    let requestRemoveItemsIsRunning = false;

    function requestRemoteItemsToFillBuffer() {
        if (requestRemoveItemsIsRunning || isRemoteDataFinished) {
            return;
        }

        const countToLoad = bufferSize - buffer.length;

        if (countToLoad === 0) {
            return;
        }

        requestRemoveItemsIsRunning = true;
        console.log('loadNextItems start');
        loadNextItems({
            count: countToLoad,
            lastItem: lastItemPushedToBuffer,
        })
            .then(({ isLast, items }) => {
                console.log('loadNextItems finished');
                requestRemoveItemsIsRunning = false;

                if (isLast) {
                    isRemoteDataFinished = true;
                } else if (items.length !== countToLoad) {
                    throw new Error(`loadNextItems for isLast=false returned wrong items count=[${items.length}] expected=[${countToLoad}]`);
                }

                for (const item of items) {
                    buffer.push(item);
                }

                lastItemPushedToBuffer = items.at(-1);

                itemsPushedToBufferSubject.next(undefined);
                requestRemoteItemsToFillBuffer();
            })
            .catch((e) => {
                error = e;
                console.log('loadNextItems error');
                requestRemoveItemsIsRunning = false;
                itemsPushedToBufferSubject.next(e);
            });
    }

    requestRemoteItemsToFillBuffer();

    // eslint-disable-next-line require-await
    return restrictParallelCalls(async (requestedItemsCount): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>> => {
        assertPositiveInteger(requestedItemsCount);

        if (requestedItemsCount > bufferSize) {
            throw new Error(`requestedItemsCount=[${requestedItemsCount}] must be less than bufferSize=[${bufferSize}]`);
        }

        if (error) {
            throw error;
        }

        // Last chunk of remove and buffer data has been extracted
        if (isRemoteDataFinished && buffer.length === 0) {
            console.log('NO MORE DATA: isRemoteDataFinished && buffer.length === 0');

            return {
                items: [],
                isLast: true,
            };
        }

        // Has enough items to extract
        if (buffer.length >= requestedItemsCount) {
            console.log('HAS ENOUGH DATA: buffer.length >= requestedItemsCount');
            const items = buffer.shiftCount(requestedItemsCount);

            if (!isRemoteDataFinished) {
                requestRemoteItemsToFillBuffer();
            }

            return {
                items,
                isLast: isRemoteDataFinished && buffer.length === 0,
            };
        }

        // No more data in remote, nothing to wait
        if (isRemoteDataFinished) {
            console.log('NO MORE DATA IN REMOTE, NOTHING TO WAIT, extract what we have');
            const items = buffer.shiftCount(requestedItemsCount);

            return {
                items,
                isLast: buffer.length === 0,
            };
        }

        return new Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<T>>((resolve, reject) => {
            const subscription = itemsPushedToBufferSubject.subscribe((error) => {
                if (error) {
                    reject(error);

                    return;
                }

                console.log('itemsPushedToBufferSubject updated');
                if (buffer.length < requestedItemsCount) {
                    return;
                }

                subscription.unsubscribe();

                requestRemoteItemsToFillBuffer();
                resolve({
                    items: buffer.shiftCount(requestedItemsCount),
                    isLast: isRemoteDataFinished && buffer.length === 0,
                });
            });
        });
    }, 'createRemoteDataProcessingWindow');
}
