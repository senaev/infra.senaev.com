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

    it('should handle empty remote data', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = Array.from({ length: 5 }, () => createTimescale(() => undefined));

        await runParallelTimescalesProcessing<{ time: number }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 10,
        });

        expect(callback).toHaveBeenCalledTimes(0);

        expect(extractItemsFunctions.map((extractItemsFunction) => extractItemsFunction.mock.calls.length)).toEqual([
            1,
            1,
            1,
            1,
            1,
        ]);
    });

    it('should handle strange intersections', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 5) {
                    return undefined;
                }

                return {
                    time: i - 3,
                };
            }),
            createTimescale((i) => {
                if (i > 4) {
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
                    time: i + 1000,
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
                        time: -3,
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: -2,
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: -1,
                    },
                    undefined,
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 0,
                    },
                    {
                        time: 0,
                    },
                    undefined,
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
                    undefined,
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
                    undefined,
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 3,
                    },
                    undefined,
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 4,
                    },
                    undefined,
                ],
            ],
            [
                [
                    undefined,
                    undefined,
                    {
                        time: 1000,
                    },
                ],
            ],
            [
                [
                    undefined,
                    undefined,
                    {
                        time: 1001,
                    },
                ],
            ],
            [
                [
                    undefined,
                    undefined,
                    {
                        time: 1002,
                    },
                ],
            ],
            [
                [
                    undefined,
                    undefined,
                    {
                        time: 1003,
                    },
                ],
            ],
            [
                [
                    undefined,
                    undefined,
                    {
                        time: 1004,
                    },
                ],
            ],
        ]);

        expect(extractItemsFunctions.map((extractItemsFunction) => extractItemsFunction.mock.calls.length)).toEqual([
            4,
            3,
            3,
        ]);
    });

    it('should handle extract function throwing errors', async () => {
        const callback = vi.fn();
        const error = new Error('Extract function failed');

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 2) {
                    return undefined;
                }

                return { time: i };
            }),
            vi.fn().mockRejectedValue(error),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return { time: i + 10 };
            }),
        ];

        await expect(() => runParallelTimescalesProcessing<{ time: number }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        })).rejects.toThrow('Extract function failed');

        // Should not call callback if extract function fails
        expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback throwing errors', async () => {
        const error = new Error('Callback failed');
        const callback = vi.fn().mockImplementation(() => {
            throw error;
        });

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return { time: i };
            }),
        ];

        await expect(() => runParallelTimescalesProcessing<{ time: number }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        })).rejects.toThrow('Callback failed');

        // Should have called callback once before failing
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should work with bufferSize of 1', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 2) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `a${i}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `b${i}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 1,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'a0',
                    },
                    {
                        time: 0,
                        value: 'b0',
                    },
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: 'a1',
                    },
                    {
                        time: 1,
                        value: 'b1',
                    },
                ],
            ],
            [
                [
                    {
                        time: 2,
                        value: 'a2',
                    },
                    undefined,
                ],
            ],
        ]);

        // Should make more calls due to smaller buffer size
        expect(extractItemsFunctions[0].mock.calls.length).toBeGreaterThan(1);
        expect(extractItemsFunctions[1].mock.calls.length).toBeGreaterThan(1);
    });

    it('should handle negative time values', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                const time = i - 9;

                return {
                    time,
                    value: `neg${time}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                const time = (i - 4) * 2;

                return {
                    time,
                    value: `neg${time}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: -9,
                        value: 'neg-9',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: -8,
                        value: 'neg-8',
                    },
                    {
                        time: -8,
                        value: 'neg-8',
                    },
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: -6,
                        value: 'neg-6',
                    },
                ],
            ],
        ]);
    });

    it('should handle zero time values', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: 0,
                    value: `zero${i}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: 0,
                    value: `alsoZero${i}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'zero0',
                    },
                    {
                        time: 0,
                        value: 'alsoZero0',
                    },
                ],
            ],
            [
                [
                    {
                        time: 0,
                        value: 'zero1',
                    },
                    {
                        time: 0,
                        value: 'alsoZero1',
                    },
                ],
            ],
        ]);
    });

    it('should handle floating point time values with precision', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 2) {
                    return undefined;
                }

                return {
                    time: i * 0.1,
                    value: `float${i}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i * 0.1 + 0.05,
                    value: `floatOffset${i}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'float0',
                    },
                    undefined,
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 0.05,
                        value: 'floatOffset0',
                    },
                ],
            ],
            [
                [
                    {
                        time: 0.1,
                        value: 'float1',
                    },
                    undefined,
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 0.15000000000000002,
                        value: 'floatOffset1',
                    },
                ],
            ],
            [
                [
                    {
                        time: 0.2,
                        value: 'float2',
                    },
                    undefined,
                ],
            ],
        ]);
    });

    it('should handle very large time values', async () => {
        const callback = vi.fn();
        const largeTime = Number.MAX_SAFE_INTEGER - 1000;

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: largeTime + i,
                    value: `large${i}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: largeTime + i + 1,
                    value: `largeOffset${i + 1}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: largeTime,
                        value: 'large0',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: largeTime + 1,
                        value: 'large1',
                    },
                    {
                        time: largeTime + 1,
                        value: 'largeOffset1',
                    },
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: largeTime + 2,
                        value: 'largeOffset2',
                    },
                ],
            ],
        ]);
    });

    it('should handle many timescales (stress test)', async () => {
        const callback = vi.fn();
        const timescalesCount = 50;

        const extractItemsFunctions = Array.from({ length: timescalesCount }, (_, timescaleIndex) =>
            createTimescale((i) => {
                if (i > 2) {
                    return undefined;
                }

                return {
                    time: i + timescaleIndex * 0.01,
                    value: `ts${timescaleIndex}_${i}`,
                };
            }));

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 10,
        });

        // Should call callback for each unique time across all timescales
        expect(callback).toHaveBeenCalled();

        // Verify all timescales were called
        extractItemsFunctions.forEach((extractFunction) => {
            expect(extractFunction).toHaveBeenCalled();
        });
    });

    it('should handle extract function returning empty items array', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `item${i}`,
                };
            }),
            vi.fn().mockResolvedValue({
                items: [],
                isLast: true,
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'item0',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: 'item1',
                    },
                    undefined,
                ],
            ],
        ]);
    });

    it('should handle extract function returning fewer items than requested', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 3) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `item${i}`,
                };
            }),
            vi.fn()
                .mockResolvedValueOnce({
                    items: [
                        {
                            time: 0,
                            value: 'partial0',
                        },
                    ],
                    isLast: false,
                })
                .mockResolvedValueOnce({
                    items: [
                        {
                            time: 1,
                            value: 'partial1',
                        },
                    ],
                    isLast: true,
                }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 3, // Request 3 but get fewer
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'item0',
                    },
                    {
                        time: 0,
                        value: 'partial0',
                    },
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: 'item1',
                    },
                    {
                        time: 1,
                        value: 'partial1',
                    },
                ],
            ],
            [
                [
                    {
                        time: 2,
                        value: 'item2',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 3,
                        value: 'item3',
                    },
                    undefined,
                ],
            ],
        ]);
    });

    it('should handle callback returning values', async () => {
        const callback = vi.fn().mockReturnValue('callback result');

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `item${i}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveReturnedWith('callback result');
    });

    it('should handle slow extract functions', async () => {
        const callback = vi.fn();
        const startTime = Date.now();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `slow${i}`,
                };
            }),
            vi.fn().mockImplementation(async () => {
                await new Promise((resolve) => setTimeout(resolve, 50));

                return {
                    items: [
                        {
                            time: 0,
                            value: 'delayed0',
                        },
                    ],
                    isLast: true,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        const endTime = Date.now();

        expect(endTime - startTime).toBeGreaterThanOrEqual(50);

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'slow0',
                    },
                    {
                        time: 0,
                        value: 'delayed0',
                    },
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: 'slow1',
                    },
                    undefined,
                ],
            ],
        ]);
    });

    it('should handle items with same time across multiple timescales', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 2) {
                    return undefined;
                }

                return {
                    time: 5,
                    value: `sameTime${i}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: 5,
                    value: `alsoSameTime${i}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: 5,
                    value: `thirdSameTime${i}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 5,
                        value: 'sameTime0',
                    },
                    {
                        time: 5,
                        value: 'alsoSameTime0',
                    },
                    {
                        time: 5,
                        value: 'thirdSameTime0',
                    },
                ],
            ],
            [
                [
                    {
                        time: 5,
                        value: 'sameTime1',
                    },
                    {
                        time: 5,
                        value: 'alsoSameTime1',
                    },
                    {
                        time: 5,
                        value: 'thirdSameTime1',
                    },
                ],
            ],
            [
                [
                    {
                        time: 5,
                        value: 'sameTime2',
                    },
                    undefined,
                    undefined,
                ],
            ],
        ]);
    });

    it('should handle bufferSize larger than total data', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `item${i}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 1000, // Much larger than data
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'item0',
                    },
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: 'item1',
                    },
                ],
            ],
        ]);

        // Should only call extract function once due to large buffer
        expect(extractItemsFunctions[0]).toHaveBeenCalledTimes(1);
    });

    it('should handle single timescale with single item', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 0) {
                    return undefined;
                }

                return {
                    time: 42,
                    value: 'single',
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 1,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 42,
                        value: 'single',
                    },
                ],
            ],
        ]);
    });

    it('should handle timescales with no overlapping times', async () => {
        const callback = vi.fn();

        const extractItemsFunctions = [
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i,
                    value: `first${i}`,
                };
            }),
            createTimescale((i) => {
                if (i > 1) {
                    return undefined;
                }

                return {
                    time: i + 100,
                    value: `second${i}`,
                };
            }),
        ];

        await runParallelTimescalesProcessing<{ time: number; value: string }[]>({
            extractItemsFunctions,
            callback,
            bufferSize: 2,
        });

        expect(callback.mock.calls).toEqual([
            [
                [
                    {
                        time: 0,
                        value: 'first0',
                    },
                    undefined,
                ],
            ],
            [
                [
                    {
                        time: 1,
                        value: 'first1',
                    },
                    undefined,
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 100,
                        value: 'second0',
                    },
                ],
            ],
            [
                [
                    undefined,
                    {
                        time: 101,
                        value: 'second1',
                    },
                ],
            ],
        ]);
    });
});
