import {
    describe,
    expect,
    it, Mock, vi,
} from 'vitest';

import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { RemoteDataProcessingWindowLoadNextItemsFunction } from '../createRemoteDataProcessingWindow/createRemoteDataProcessingWindow';

import { runParallelTimescalesProcessing } from './runParallelTimescalesProcessing';

function createTimescale<T extends { time: number }>(callback: (index: UnsignedInteger) => T | undefined): Mock<RemoteDataProcessingWindowLoadNextItemsFunction<T>> {
    let i = 0;

    return vi.fn(({ count }) => {
        const items: T[] = [];

        for (let c = 0; c < count; c++) {
            const item = callback(i);

            if (item) {
                items.push(item);
            }

            i++;
        }

        return Promise.resolve({
            items,
            isLast: items.length !== count,
        });
    });
}

describe('runParallelTimescalesProcessing', () => {
    it('should work with small portion of data', async () => {
        const callback = vi.fn();

        await runParallelTimescalesProcessing<[{ time: number }]>({
            extractItemsFunctions: [
                () => Promise.resolve({
                    items: [
                        {
                            time: 1,
                            value: 1,
                        },
                        {
                            time: 2,
                            abc: 'def',
                        },
                        {
                            time: 3,
                        },
                    ],
                    isLast: true,
                }),
            ],
            callback,
            bufferSize: 1000,
        });

        expect(callback).toHaveBeenCalledTimes(3);
        expect(callback).toHaveBeenNthCalledWith(1, [
            {
                time: 1,
                value: 1,
            },
        ]);
        expect(callback).toHaveBeenNthCalledWith(2, [
            {
                time: 2,
                abc: 'def',
            },
        ]);
        expect(callback).toHaveBeenNthCalledWith(3, [
            {
                time: 3,
            },
        ]);
    });

    it('should work with multiple different timescales', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 9) {
                    return undefined;
                }

                return {
                    time: i,
                    value: String(i),
                };
            }),
            createTimescale((i) => {
                if (i > 4) {
                    return undefined;
                }

                return {
                    time: i,
                    value: String(i),
                };
            }),
            createTimescale<{ time: number; value: string }>(() => undefined),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 1000,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: '0',
                    },
                    {
                        time: 0,
                        value: '0',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: '1',
                    },
                    {
                        time: 1,
                        value: '1',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 2,
                        value: '2',
                    },
                    {
                        time: 2,
                        value: '2',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 3,
                        value: '3',
                    },
                    {
                        time: 3,
                        value: '3',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 4,
                        value: '4',
                    },
                    {
                        time: 4,
                        value: '4',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 5,
                        value: '5',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 6,
                        value: '6',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 7,
                        value: '7',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 8,
                        value: '8',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 9,
                        value: '9',
                    },
                    undefined,
                    undefined,
                ],
            ],
        ]);

        expect(extractItemsFunctions.map((extractItemsFunction) => extractItemsFunction.mock.calls.length)).toEqual([
            1,
            1,
            1,
        ]);
    });

    it('should work with bufferSize', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 9) {
                    return undefined;
                }

                return {
                    time: i,
                    value: String(i),
                };
            }),
            createTimescale((i) => {
                if (i > 4) {
                    return undefined;
                }

                return {
                    time: i,
                    value: String(i),
                };
            }),
            createTimescale<{ time: number; value: string }>(() => undefined),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 3,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: '0',
                    },
                    {
                        time: 0,
                        value: '0',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: '1',
                    },
                    {
                        time: 1,
                        value: '1',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 2,
                        value: '2',
                    },
                    {
                        time: 2,
                        value: '2',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 3,
                        value: '3',
                    },
                    {
                        time: 3,
                        value: '3',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 4,
                        value: '4',
                    },
                    {
                        time: 4,
                        value: '4',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 5,
                        value: '5',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 6,
                        value: '6',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 7,
                        value: '7',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 8,
                        value: '8',
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 9,
                        value: '9',
                    },
                    undefined,
                    undefined,
                ],
            ],
        ]);

        expect(extractItemsFunctions.map((extractItemsFunction) => extractItemsFunction.mock.calls)).toEqual([
            [
                [
                    {
                        count: 3,
                        lastItem: undefined,
                    },
                ],
                [
                    {
                        count: 3,
                        lastItem: {
                            time: 2,
                            value: '2',
                        },
                    },
                ],
                [
                    {
                        count: 3,
                        lastItem: {
                            time: 5,
                            value: '5',
                        },
                    },
                ],
                [
                    {
                        count: 3,
                        lastItem: {
                            time: 8,
                            value: '8',
                        },
                    },
                ],
            ],
            [
                [
                    {
                        count: 3,
                        lastItem: undefined,
                    },
                ],
                [
                    {
                        count: 3,
                        lastItem: {
                            time: 2,
                            value: '2',
                        },
                    },
                ],
            ],
            [
                [
                    {
                        count: 3,
                        lastItem: undefined,
                    },
                ],
            ],
        ]);

        const resultPromisesArrays = extractItemsFunctions.map((extractItemsFunction) => extractItemsFunction.mock.results.map((result) => result.value));
        const results = await Promise.all(resultPromisesArrays.map((resultPromises) => Promise.all(resultPromises)));

        expect(results).toEqual([
            [
                {
                    isLast: false,
                    items: [
                        {
                            time: 0,
                            value: '0',
                        },
                        {
                            time: 1,
                            value: '1',
                        },
                        {
                            time: 2,
                            value: '2',
                        },
                    ],
                },
                {
                    isLast: false,
                    items: [
                        {
                            time: 3,
                            value: '3',
                        },
                        {
                            time: 4,
                            value: '4',
                        },
                        {
                            time: 5,
                            value: '5',
                        },
                    ],
                },
                {
                    isLast: false,
                    items: [
                        {
                            time: 6,
                            value: '6',
                        },
                        {
                            time: 7,
                            value: '7',
                        },
                        {
                            time: 8,
                            value: '8',
                        },
                    ],
                },
                {
                    isLast: true,
                    items: [
                        {
                            time: 9,
                            value: '9',
                        },
                    ],
                },
            ],
            [
                {
                    isLast: false,
                    items: [
                        {
                            time: 0,
                            value: '0',
                        },
                        {
                            time: 1,
                            value: '1',
                        },
                        {
                            time: 2,
                            value: '2',
                        },
                    ],
                },
                {
                    isLast: true,
                    items: [
                        {
                            time: 3,
                            value: '3',
                        },
                        {
                            time: 4,
                            value: '4',
                        },
                    ],
                },
            ],
            [
                {
                    isLast: true,
                    items: [],
                },
            ],
        ]);
    });

    it('should not put different time scales in the same callback', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 3) {
                    return undefined;
                }

                return {
                    time: i,
                };
            }),
            createTimescale((i) => {
                if (i > 4) {
                    return undefined;
                }

                return {
                    time: i / 2,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                    },
                    {
                        time: 0,
                    },
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 0.5,
                    },
                ],
            ],
            [
                [
                    {
                        time: 1,
                    },
                    {
                        time: 1,
                    },
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 1.5,
                    },
                ],
            ],
            [
                [
                    {
                        time: 2,
                    },
                    {
                        time: 2,
                    },
                ],
            ],
            [
                [
                    {
                        time: 3,
                    },
                    undefined,
                ],
            ],
        ]);

        expect(extractItemsFunctions.map((extractItemsFunction) => extractItemsFunction.mock.calls.length)).toEqual([
            3,
            3,
        ]);
    });

    it('should throw error if bufferSize is not a positive integer', async () => {
        await expect(() => runParallelTimescalesProcessing<{ time: number }[]>({
            extractItemsFunctions: [createTimescale(() => undefined)],
            callback: vi.fn(),
            bufferSize: 0,
        })).rejects.toThrow('value=[0] is not a positive integer errorMessage=[runParallelTimescalesProcessing bufferSize should be a positive integer]');
    });

    it('should throw error if there is no extract functions', async () => {
        await expect(() => runParallelTimescalesProcessing<{ time: number }[]>({
            extractItemsFunctions: [],
            callback: vi.fn(),
            bufferSize: 10,
        })).rejects.toThrow('value=[0] is not a positive integer errorMessage=[runParallelTimescalesProcessing extractItemsFunctions should array should NOT be empty]');
    });
});
