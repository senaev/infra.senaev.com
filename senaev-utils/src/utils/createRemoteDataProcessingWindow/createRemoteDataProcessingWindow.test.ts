import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { callTimes } from '../Function/callTimes/callTimes';
import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

import {
    createRemoteDataProcessingWindow, RemoteDataProcessingWindowLoadNextItemsFunction, RemoteDataProcessingWindowLoadNextItemsReturnType,
} from './createRemoteDataProcessingWindow';

describe('createRemoteDataProcessingWindow', () => {
    it('should request normal lastItem', async () => {
        const loadNextItems = vi.fn<RemoteDataProcessingWindowLoadNextItemsFunction<string>>(({
            lastItem,
            count,
        }): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<string>> => {
            const nextNumber = lastItem === undefined
                ? 0
                : (Number(lastItem) + 1);

            return Promise.resolve({
                items: [...Array(count)].map((_, i) => String(i + nextNumber)),
                isLast: false,
            });
        });

        const window = createRemoteDataProcessingWindow({
            bufferSize: 100,
            minItemsToLoad: 10,
            loadNextItems,
        });

        expect(loadNextItems).toHaveBeenCalledTimes(0);
        const promise1 = window.getNextItems(5);

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        expect(await promise1).toEqual({
            isLast: false,
            items: [
                '0',
                '1',
                '2',
                '3',
                '4',
            ],
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        const promise2 = window.getNextItems(5);

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        expect(await promise2).toEqual({
            isLast: false,
            items: [
                '5',
                '6',
                '7',
                '8',
                '9',
            ],
        });

        expect(loadNextItems).toHaveBeenCalledTimes(1);
        const promise3 = window.getNextItems(1);

        expect(loadNextItems).toHaveBeenCalledTimes(2);
        expect(await promise3).toEqual({
            isLast: false,
            items: ['10'],
        });

        const promise4 = window.getNextItems(33);

        expect(loadNextItems).toHaveBeenCalledTimes(3);
        expect(await promise4).toEqual({
            isLast: false,
            items: [
                '11',
                '12',
                '13',
                '14',
                '15',
                '16',
                '17',
                '18',
                '19',
                '20',
                '21',
                '22',
                '23',
                '24',
                '25',
                '26',
                '27',
                '28',
                '29',
                '30',
                '31',
                '32',
                '33',
                '34',
                '35',
                '36',
                '37',
                '38',
                '39',
                '40',
                '41',
                '42',
                '43',
            ],
        });

        const promise5 = window.getNextItems(2);

        expect(loadNextItems).toHaveBeenCalledTimes(4);
        expect(await promise5).toEqual({
            isLast: false,
            items: [
                '44',
                '45',
            ],
        });

        expect(loadNextItems.mock.calls).toEqual([
            [
                {
                    count: 10,
                    lastItem: undefined,
                },
            ],
            [
                {
                    count: 10,
                    lastItem: '9',
                },
            ],
            [
                {
                    count: 24,
                    lastItem: '19',
                },
            ],
            [
                {
                    count: 10,
                    lastItem: '43',
                },
            ],
        ]);
    });

    it('minItemsToLoad should not be bigger than half of maxWindowSize', () => {
        expect(() => createRemoteDataProcessingWindow({
            bufferSize: 100,
            minItemsToLoad: 51,
            loadNextItems: vi.fn(),
        })).toThrow();

        expect(() => createRemoteDataProcessingWindow({
            bufferSize: 100,
            minItemsToLoad: 50,
            loadNextItems: vi.fn(),
        })).not.toThrow();
    });

    it('should correctly handle limits', async () => {
        const loadNextItems = vi.fn<RemoteDataProcessingWindowLoadNextItemsFunction<number>>(({
            lastItem,
            count,
        }): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<number>> => {
            const nextNumber = lastItem === undefined
                ? 0
                : (lastItem + 1);

            let isLast = false;
            const items: number[] = [];

            for (let i = 0; i < count; i++) {
                const number = i + nextNumber;

                if (number >= 50) {
                    isLast = true;
                    break;
                }

                items.push(number);
            }

            return Promise.resolve({
                items,
                isLast,
            });
        });

        const window = createRemoteDataProcessingWindow({
            bufferSize: 50,
            minItemsToLoad: 10,
            loadNextItems,
        });

        const result1 = await window.getNextItems(35);

        expect(result1).toEqual({
            isLast: false,
            items: [
                0,
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
                13,
                14,
                15,
                16,
                17,
                18,
                19,
                20,
                21,
                22,
                23,
                24,
                25,
                26,
                27,
                28,
                29,
                30,
                31,
                32,
                33,
                34,
            ],
        });

        const result2 = await window.getNextItems(5);

        expect(result2).toEqual({
            isLast: false,
            items: [
                35,
                36,
                37,
                38,
                39,
            ],
        });

        expect(loadNextItems.mock.calls).toEqual([
            [
                {
                    count: 35,
                    lastItem: undefined,
                },
            ],
            [
                {
                    count: 10,
                    lastItem: 34,
                },
            ],
        ]);

        const result3 = await window.getNextItems(6);

        expect(result3).toEqual({
            isLast: false,
            items: [
                40,
                41,
                42,
                43,
                44,
                45,
            ],
        });

        expect(loadNextItems.mock.calls.length).toEqual(3);
        expect(loadNextItems.mock.calls[2]).toEqual([
            {
                count: 10,
                lastItem: 44,
            },
        ]);

        const result4 = await window.getNextItems(6);

        expect(result4).toEqual({
            isLast: true,
            items: [
                46,
                47,
                48,
                49,
            ],
        });

        expect(loadNextItems.mock.calls.length).toEqual(3);

        expect(() => window.getNextItems(600)).rejects.toThrow('requestedItemsCount=[600] must be less than bufferSize=[50]');
        const result5 = await window.getNextItems(50);

        expect(result5).toEqual({
            isLast: true,
            items: [],
        });
        expect(loadNextItems.mock.calls.length).toEqual(3);

        const result6 = await window.getNextItems(1);

        expect(result6).toEqual({
            isLast: true,
            items: [],
        });
        expect(loadNextItems.mock.calls.length).toEqual(3);
    });

    it('should return isLast=true with empty result if loadNextItems returns empty array', async () => {
        const resolvers: ((value: RemoteDataProcessingWindowLoadNextItemsReturnType<number>) => void)[] = [];
        const loadNextItems = vi.fn<RemoteDataProcessingWindowLoadNextItemsFunction<number>>((): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<number>> => new Promise((resolve) => {
            resolvers.push(resolve);
        }));

        expect(resolvers.length).toEqual(0);

        const window = createRemoteDataProcessingWindow({
            bufferSize: 1000,
            minItemsToLoad: 10,
            loadNextItems,
        });

        const promise1 = window.getNextItems(10);

        await Promise.race([
            promise1.then(() => {
                throw new Error('should not be called before resolver call');
            }),
            promiseTimeout(5),
        ]);

        resolvers[0]({
            items: [
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
            ],
            isLast: false,
        });

        expect(await promise1).toEqual({
            items: [
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
            ],
            isLast: false,
        });

        const promise2 = window.getNextItems(10);

        await Promise.race([
            promise2.then(() => {
                throw new Error('promise2 should not be called before resolver call');
            }),
            promiseTimeout(5),
        ]);

        resolvers[1]({
            items: [],
            isLast: true,
        });

        expect(await promise2).toEqual({
            items: [],
            isLast: true,
        });
    });

    it('should throw error is loadNextItems returns wrong isLast parameter in first call', async () => {
        const window = createRemoteDataProcessingWindow({
            bufferSize: 1000,
            minItemsToLoad: 10,
            loadNextItems: (): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<number>> => Promise.resolve({
                items: [
                    1,
                    2,
                    3,
                    4,
                    5,
                ],
                isLast: false,
            }),
        });

        await expect(window.getNextItems(10)).rejects.toThrow('loadNextItems for isLast=false returned wrong items count=[5] expected=[10]');
    });

    it('should throw error is loadNextItems returns wrong isLast parameter in second call', async () => {
        const window = createRemoteDataProcessingWindow({
            bufferSize: 1000,
            minItemsToLoad: 10,
            loadNextItems: (): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<number>> => Promise.resolve({
                items: [
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
                ],
                isLast: false,
            }),

        });

        await expect(window.getNextItems(5)).resolves.toEqual({
            items: [
                1,
                2,
                3,
                4,
                5,
            ],
            isLast: false,
        });

        await expect(window.getNextItems(60)).rejects.toThrow('loadNextItems for isLast=false returned wrong items count=[10] expected=[55]');
    });

    it('should throw error if wrong items count is requested', async () => {
        const window = createRemoteDataProcessingWindow({
            bufferSize: 1000,
            minItemsToLoad: 1,
            loadNextItems: (): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<number>> => Promise.resolve({
                items: [1],
                isLast: false,
            }),
        });

        await expect(window.getNextItems(-2)).rejects.toThrow('value=[-2] is not a positive integer');
        await expect(window.getNextItems(0.5)).rejects.toThrow('value=[0.5] is not a positive integer');
        await expect(window.getNextItems(0)).rejects.toThrow('value=[0] is not a positive integer');
        await expect(window.getNextItems(1)).resolves.toEqual({
            items: [1],
            isLast: false,
        });
    });

    it('remove start of the window if there are too many items', async () => {
        let currentNumber = 0;
        const window = createRemoteDataProcessingWindow({
            bufferSize: 20,
            minItemsToLoad: 7,
            loadNextItems: ({ count }): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<number>> => {
                const numbers: number[] = [];

                callTimes(count, () => {
                    numbers.push(currentNumber++);
                });

                return Promise.resolve({
                    items: numbers,
                    isLast: false,
                });
            },
        });

        const result1 = await window.getNextItems(10);

        expect(result1.items.join(',')).toEqual('0,1,2,3,4,5,6,7,8,9');

        const result2 = await window.getNextItems(3);

        expect(result2.items.join(',')).toEqual('10,11,12');

        const result3 = await window.getNextItems(9);

        expect(result3.items.join(',')).toEqual('13,14,15,16,17,18,19,20,21');

        expect(() => window.getNextItems(21)).rejects.toThrow('requestedItemsCount=[21] must be less than bufferSize=[20]');

        const result4 = await window.getNextItems(20);

        expect(result4.items.length).toEqual(20);
        expect(result4.items.join(',')).toEqual('22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41');
    });

    it('should be able to handle an empty array in the last call', async () => {
        let returnValue: RemoteDataProcessingWindowLoadNextItemsReturnType<number> = {
            items: [
                1,
                2,
                3,
            ],
            isLast: false,
        };

        const window = createRemoteDataProcessingWindow({
            bufferSize: 1000,
            minItemsToLoad: 1,
            loadNextItems: (): Promise<RemoteDataProcessingWindowLoadNextItemsReturnType<number>> => Promise.resolve(returnValue),
        });

        await expect(window.getNextItems(4)).rejects.toThrow('loadNextItems for isLast=false returned wrong items count=[3] expected=[4]');
        await expect(window.getNextItems(2)).rejects.toThrow('loadNextItems for isLast=false returned wrong items count=[3] expected=[2]');

        const result = await window.getNextItems(3);

        expect(result).toEqual({
            items: [
                1,
                2,
                3,
            ],
            isLast: false,
        });

        returnValue = {
            items: [],
            isLast: true,
        };

        const result2 = await window.getNextItems(3);

        expect(result2).toEqual({
            items: [],
            isLast: true,
        });

        const result3 = await window.getNextItems(3);

        expect(result3).toEqual({
            items: [],
            isLast: true,
        });
    });
});
