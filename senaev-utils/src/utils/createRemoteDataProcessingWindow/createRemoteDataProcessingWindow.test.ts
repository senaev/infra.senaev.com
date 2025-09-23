import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { createArray } from '../Array/createArray/createArray';
import { callFirstThenOther } from '../Function/callFirstThenOther/callFirstThenOther';
import { restrictParallelCalls } from '../Promise/restrictParallelCalls/restrictParallelCalls';
import { getRandomIntegerInARange } from '../random/getRandomIntegerInARange/getRandomIntegerInARange';
import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

import {
    createRemoteDataProcessingWindow, RemoteDataProcessingWindowExtractItemsFunction, RemoteDataProcessingWindowLoadNextItemsReturnType,
} from './createRemoteDataProcessingWindow';

describe('createRemoteDataProcessingWindow', () => {
    it('should request data from remote source', async () => {
        const loadNextItems = vi.fn(({ count }) => {
            const items = createArray(count, 0);

            return Promise.resolve({
                items,
                isLast: false,
            });
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 10,
            loadNextItems,
        });

        expect(extractItems).toBeTypeOf('function');

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        expect(loadNextItems).toHaveBeenCalledWith({
            count: 10,
            lastItem: undefined,
        });

        await promiseTimeout(10);

        expect(loadNextItems).toHaveBeenCalledTimes(1);

        const result = await extractItems(5);

        expect(result).toEqual({
            items: [
                0,
                0,
                0,
                0,
                0,
            ],
            isLast: false,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(2);
        expect(loadNextItems).toHaveBeenCalledWith({
            count: 5,
            lastItem: 0,
        });
    });

    it('should handle empty remote data source (isLast=true immediately)', async () => {
        const loadNextItems = vi.fn().mockResolvedValue({
            items: [],
            isLast: true,
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await promiseTimeout(10);

        const result = await extractItems(3);

        expect(result).toEqual({
            items: [],
            isLast: true,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        expect(loadNextItems).toHaveBeenCalledWith({
            count: 5,
            lastItem: undefined,
        });

        expect(await extractItems(3)).toEqual({
            items: [],
            isLast: true,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);
    });

    it('should handle partial data from remote source if data in remote source is finished', async () => {
        let callCount = 0;
        const loadNextItems = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({
                    items: [
                        1,
                        2,
                        3,
                    ], // Only 3 items when 5 were requested
                    isLast: true,
                });
            }

            return Promise.resolve({
                items: [],
                isLast: true,
            });
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await promiseTimeout(10);

        const result = await extractItems(2);

        expect(result).toEqual({
            items: [
                1,
                2,
            ],
            isLast: false,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);

        const result2 = await extractItems(2);

        expect(result2).toEqual({
            items: [3],
            isLast: true,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);

        const result3 = await extractItems(2);

        expect(result3).toEqual({
            items: [],
            isLast: true,
        });
    });

    it('should handle multiple sequential extractions', async () => {
        const items = [
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
        ];
        let itemIndex = 0;

        const loadNextItems = vi.fn().mockImplementation(({ count }) => {
            const batch = items.slice(itemIndex, itemIndex + count);

            itemIndex += count;

            return Promise.resolve({
                items: batch,
                isLast: itemIndex >= items.length,
            });
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 8,
            loadNextItems,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        expect(loadNextItems).nthCalledWith(1, {
            count: 8,
            lastItem: undefined,
        });

        await promiseTimeout(10);

        // First extraction
        const result1 = await extractItems(3);

        expect(result1).toEqual({
            items: [
                1,
                2,
                3,
            ],
            isLast: false,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(2);
        expect(loadNextItems).nthCalledWith(2, {
            count: 3,
            lastItem: 8,
        });

        // Second extraction
        const result2 = await extractItems(4);

        expect(result2).toEqual({
            items: [
                4,
                5,
                6,
                7,
            ],
            isLast: false,
        });

        // Third extraction - should trigger new remote request
        const result3 = await extractItems(2);

        expect(result3).toEqual({
            items: [
                8,
                9,
            ],
            isLast: false,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(3);
        expect(loadNextItems).nthCalledWith(3, {
            count: 4,
            lastItem: 11,
        });

        const result4 = await extractItems(8);

        expect(result4).toEqual({
            items: [
                10,
                11,
                12,
            ],
            isLast: true,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(3);
    });

    it('should handle extraction of all remaining items when remote data is finished', async () => {
        const loadNextItems = vi.fn().mockResolvedValue({
            items: [
                1,
                2,
                3,
                4,
                5,
            ],
            isLast: true,
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await promiseTimeout(10);

        const result = await extractItems(5);

        expect(result).toEqual({
            items: [
                1,
                2,
                3,
                4,
                5,
            ],
            isLast: true,
        });

        // Try to extract more items after all data is consumed
        const result2 = await extractItems(1);

        expect(result2).toEqual({
            items: [],
            isLast: true,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);
    });

    it('should handle slow remote data loading', async () => {
        const loadNextItems = vi.fn().mockImplementation(({ count }) => new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    items: createArray(count, Math.random()),
                    isLast: false,
                });
            }, 10);
        }));

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 10,
            loadNextItems,
        });

        // Try to extract before data is loaded
        const extractionPromise = extractItems(5);

        expect(loadNextItems).toHaveBeenCalledTimes(1);

        await extractionPromise;

        const result = await extractionPromise;

        expect(result.items).toHaveLength(5);
        expect(result.isLast).toBe(false);
    });

    it('should handle invalid requestedItemsCount (greater than bufferSize)', async () => {
        const loadNextItems = vi.fn().mockResolvedValue({
            items: [
                1,
                2,
                3,
                4,
                5,
            ],
            isLast: false,
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await expect(() => extractItems(10)).rejects.toThrow('createRemoteDataProcessingWindow: requestedItemsCount=[10] must be less than bufferSize=[5]');
    });

    it('should handle invalid requestedItemsCount (non-positive integer)', async () => {
        const loadNextItems = vi.fn().mockResolvedValue({
            items: [
                1,
                2,
                3,
                4,
                5,
            ],
            isLast: false,
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await promiseTimeout(10);

        await expect(extractItems(0)).rejects.toThrow();
        await expect(extractItems(-1)).rejects.toThrow();
    });

    it('should handle wrong items count from remote source when isLast=false', async () => {
        const loadNextItems = vi.fn().mockResolvedValue({
            items: [
                1,
                2,
                3,
            ], // Only 3 items when 5 were requested
            isLast: false, // But claiming it's not the last batch
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await promiseTimeout(10);

        await expect(extractItems(2)).rejects.toThrow('createRemoteDataProcessingWindow: loadNextItems for isLast=false returned wrong items count=[3] expected=[5]');
    });

    it('should handle remote data loading errors', async () => {
        const loadNextItems = vi.fn().mockRejectedValue(new Error('Network error'));

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await promiseTimeout(10);

        await expect(extractItems(3)).rejects.toThrow('Network error');
        expect(loadNextItems).toHaveBeenCalledTimes(1);
    });

    it('should handle string items instead of numbers', async () => {
        const loadNextItems = vi.fn().mockResolvedValue({
            items: [
                'apple',
                'banana',
                'cherry',
                'date',
                'elderberry',
            ],
            isLast: true,
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        const result = await extractItems(3);

        expect(result).toEqual({
            items: [
                'apple',
                'banana',
                'cherry',
            ],
            isLast: false,
        });
    });

    it('should handle object items', async () => {
        const items = [
            {
                id: 1,
                name: 'Alice',
            },
            {
                id: 2,
                name: 'Bob',
            },
            {
                id: 3,
                name: 'Charlie',
            },
            {
                id: 4,
                name: 'Diana',
            },
            {
                id: 5,
                name: 'Eve',
            },
        ];

        const loadNextItems = vi.fn().mockResolvedValue({
            items,
            isLast: true,
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        await promiseTimeout(10);

        const result = await extractItems(2);

        expect(result).toEqual({
            items: [
                {
                    id: 1,
                    name: 'Alice',
                },
                {
                    id: 2,
                    name: 'Bob',
                },
            ],
            isLast: false,
        });
    });

    it('should handle buffer size of 1', async () => {
        const loadNextItems = vi.fn().mockImplementation(({ count }) => Promise.resolve({
            items: createArray(count, 'item'),
            isLast: false,
        }));

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 1,
            loadNextItems,
        });

        await promiseTimeout(10);

        const result1 = await extractItems(1);

        expect(result1).toEqual({
            items: ['item'],
            isLast: false,
        });

        const result2 = await extractItems(1);

        expect(result2).toEqual({
            items: ['item'],
            isLast: false,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(3); // Initial + 2 refills
    });

    it('should reject next call if previous one is not finished', async () => {
        const loadNextItems = vi.fn().mockImplementation(({ count }) => Promise.resolve({
            items: createArray(count, 'item'),
            isLast: false,
        }));

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 1,
            loadNextItems,
        });

        const promise1 = extractItems(1);

        await expect(() => extractItems(1)).toThrow('restrictParallelCalls errorMessage=[createRemoteDataProcessingWindow] previous call is not finished, do not call function in paralle');

        const result1 = await promise1;

        expect(result1).toEqual({
            items: ['item'],
            isLast: false,
        });

        const promise2 = extractItems(1);

        const result2 = await promise2;

        expect(result2).toEqual({
            items: ['item'],
            isLast: false,
        });
    });

    it('should fulfill buffer without parallel requests', async () => {
        let promise: Promise<unknown> | undefined = undefined;

        const loadNextItems = vi.fn().mockImplementation(restrictParallelCalls(({ count }) => {
            promise = Promise
                .resolve({
                    items: createArray(count, 'item'),
                    isLast: false,
                })
                .then(async (result) => {
                    await promiseTimeout(30);

                    return result;
                });

            return promise;
        }));

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 100,
            loadNextItems,
        });

        await promise;
        await promiseTimeout(0);

        expect(loadNextItems).toHaveBeenCalledTimes(1);

        const promise1 = extractItems(1);

        expect(loadNextItems).toHaveBeenCalledTimes(2);
        const result1 = await promise1;

        expect(loadNextItems).toHaveBeenCalledTimes(2);

        const promise2 = extractItems(2);

        expect(loadNextItems).toHaveBeenCalledTimes(2);
        const result2 = await promise2;

        expect(loadNextItems).toHaveBeenCalledTimes(2);

        const promise3 = extractItems(3);

        expect(loadNextItems).toHaveBeenCalledTimes(2);
        const result3 = await promise3;

        expect(loadNextItems).toHaveBeenCalledTimes(2);

        expect(result1).toEqual({
            items: ['item'],
            isLast: false,
        });
        expect(result2).toEqual({
            items: [
                'item',
                'item',
            ],
            isLast: false,
        });
        expect(result3).toEqual({
            items: [
                'item',
                'item',
                'item',
            ],
            isLast: false,
        });

        await promise;

        await promiseTimeout(0);
        expect(loadNextItems).toHaveBeenCalledTimes(3);
    });

    it('should wait for enough data in buffer to extract', async () => {
        let promise: Promise<unknown> | undefined = undefined;

        const loadNextItems = vi.fn(({ count }) => {
            promise = promiseTimeout(25).then(() => {
                return {
                    items: createArray(count, 0),
                    isLast: false,
                };
            });

            return promise as Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<unknown>>;
        });

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 100,
            loadNextItems,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);

        // Wait for buffer to be filled
        // 1. Request 100 items
        await promise;

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        expect(loadNextItems).lastCalledWith({
            count: 100,
            lastItem: undefined,
        });

        // Extract some data and wait for request started
        const promise1 = extractItems(50);

        // 2. Request 50 items, 50 items in buffer
        expect(loadNextItems).toHaveBeenCalledTimes(2);
        expect(loadNextItems).lastCalledWith({
            count: 50,
            lastItem: 0,
        });

        await promise1;
        expect(loadNextItems).toHaveBeenCalledTimes(2);

        // Extract additional data while previous request is in progress, but we still have enough data in buffer
        const promise2 = extractItems(25);

        // 2.1. 50 items request is still in progress, 25 items is still in buffer
        expect(loadNextItems).toHaveBeenCalledTimes(2);

        await promise2;

        expect(loadNextItems).toHaveBeenCalledTimes(2);

        // Not enough data in buffer, wait for request to be finished
        // 3. when 50 items request is finished, there will be 75 items in buffer and 25 items had to be loaded
        // 4. then, we extract 100 items, and, as buffer is empty, one more 100 candles request is needed
        const promise3 = extractItems(100);

        expect(loadNextItems).toHaveBeenCalledTimes(2);

        await promise3;
        await promise;

        // Should made two more requests to fill the buffer
        expect(loadNextItems).toHaveBeenCalledTimes(4);
        expect(loadNextItems).nthCalledWith(3, {
            count: 25,
            lastItem: 0,
        });
        expect(loadNextItems).nthCalledWith(4, {
            count: 100,
            lastItem: 0,
        });
    });

    it('load testing', async () => {
        const loadNextItems = vi.fn().mockImplementation(restrictParallelCalls(async ({ count }) => {
            const response = {
                items: createArray(count, 0),
                isLast: false,
            };

            if (Math.random() < 0.1) {
                await promiseTimeout(Math.random() * 4);
            }

            return response;
        }));

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 10000,
            loadNextItems,
        });

        for (let i = 0; i < 50; i++) {
            await extractItems(getRandomIntegerInARange(1, 10));

            if (Math.random() < 0.1) {
                await promiseTimeout(Math.random() * 4);
            }
        }
    });

    it('should return successfully loaded items before error', async () => {
        const loadNextItems = callFirstThenOther(
            () => Promise.resolve({
                items: createArray(5, 0),
                isLast: false,
            }),
            () => {
                throw new Error('Network error');
            }
        );

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 5,
            loadNextItems,
        });

        const result = await extractItems(5);

        expect(result).toEqual({
            items: [
                0,
                0,
                0,
                0,
                0,
            ],
            isLast: false,
        });

        await expect(extractItems(1)).rejects.toThrow('Network error');
    });

    it('should NOT return items after load error', async () => {
        let i = 0;
        const loadNextItems = ({ count }: { count: number }) => {
            i++;

            if (i === 3) {
                throw new Error('Network error');
            }

            return Promise.resolve({
                items: createArray(count, 'ITEM'),
                isLast: false,
            });
        };

        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 10,
            loadNextItems,
        });

        await extractItems(10);
        await extractItems(1);

        await promiseTimeout(10);

        await expect(extractItems(1)).rejects.toThrow('Network error');

        await promiseTimeout(10);

        await expect(extractItems(1)).rejects.toThrow('Network error');
        await expect(extractItems(1)).rejects.toThrow('Network error');
        await expect(extractItems(1)).rejects.toThrow('Network error');
    });

    it('undefined error protection', async () => {
        const extractItems = createRemoteDataProcessingWindow({
            bufferSize: 10,
            loadNextItems: () => {
                // eslint-disable-next-line no-throw-literal
                throw undefined;
            },
        });

        await expect(extractItems(1)).rejects.toThrow();
    });

    it('should handle last data with lack of items on async waiting for data status', async () => {
        let i = -1;
        const results = [
            // First buffer fill
            {
                items: createArray(100, 0),
                isLast: false,
            },
            // Lack of candles in the last response
            {
                items: createArray(60, 0),
                isLast: true,
            },
        ];
        const extractItems = await new Promise<RemoteDataProcessingWindowExtractItemsFunction<number>>((resolve) => {
            const extractItemsFunction = createRemoteDataProcessingWindow<number>({
                bufferSize: 100,
                loadNextItems: async () => {
                    i++;

                    await promiseTimeout(10);

                    resolve(extractItemsFunction);

                    return results[i];
                },
            });
        });

        // Wait for buffer to be filled
        await promiseTimeout(0);

        // Cause empty buffer and data loading
        expect(await extractItems(90)).toEqual({
            items: createArray(90, 0),
            isLast: false,
        });

        // Cause waiting for the next items
        expect(await extractItems(99)).toEqual({
            items: createArray(70, 0),
            isLast: true,
        });
    });
});
