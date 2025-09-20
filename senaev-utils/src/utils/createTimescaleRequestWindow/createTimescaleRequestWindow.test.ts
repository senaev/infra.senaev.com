import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { callTimes } from '../../utils/Function/callTimes/callTimes';
import { promiseTimeout } from '../../utils/timers/promiseTimeout/promiseTimeout';

import {
    createTimescaleRequestWindow, TimescaleRequestWindowLoadNextObjectsFunction, TimescaleRequestWindowLoadNextObjectsReturnType,
} from './createTimescaleRequestWindow';

describe('createTimescaleRequestWindow', () => {
    it('should request normal lastObject', async () => {
        const loadNextObjects = vi.fn<TimescaleRequestWindowLoadNextObjectsFunction<string>>(({
            lastObject,
            count,
        }): Promise<TimescaleRequestWindowLoadNextObjectsReturnType<string>> => {
            const nextNumber = lastObject === undefined
                ? 0
                : (Number(lastObject) + 1);

            return Promise.resolve({
                objects: [...Array(count)].map((_, i) => String(i + nextNumber)),
                isLast: false,
            });
        });

        const window = createTimescaleRequestWindow({
            bufferSize: 100,
            minObjectsToLoad: 10,
            loadNextObjects,
        });

        expect(loadNextObjects).toHaveBeenCalledTimes(0);
        const promise1 = window.getNextObjects(5);

        expect(loadNextObjects).toHaveBeenCalledTimes(1);
        expect(await promise1).toEqual({
            isLast: false,
            objects: [
                '0',
                '1',
                '2',
                '3',
                '4',
            ],
        });

        expect(loadNextObjects).toHaveBeenCalledTimes(1);
        const promise2 = window.getNextObjects(5);

        expect(loadNextObjects).toHaveBeenCalledTimes(1);
        expect(await promise2).toEqual({
            isLast: false,
            objects: [
                '5',
                '6',
                '7',
                '8',
                '9',
            ],
        });

        expect(loadNextObjects).toHaveBeenCalledTimes(1);
        const promise3 = window.getNextObjects(1);

        expect(loadNextObjects).toHaveBeenCalledTimes(2);
        expect(await promise3).toEqual({
            isLast: false,
            objects: ['10'],
        });

        const promise4 = window.getNextObjects(33);

        expect(loadNextObjects).toHaveBeenCalledTimes(3);
        expect(await promise4).toEqual({
            isLast: false,
            objects: [
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

        const promise5 = window.getNextObjects(2);

        expect(loadNextObjects).toHaveBeenCalledTimes(4);
        expect(await promise5).toEqual({
            isLast: false,
            objects: [
                '44',
                '45',
            ],
        });

        expect(loadNextObjects.mock.calls).toEqual([
            [
                {
                    count: 10,
                    lastObject: undefined,
                },
            ],
            [
                {
                    count: 10,
                    lastObject: '9',
                },
            ],
            [
                {
                    count: 24,
                    lastObject: '19',
                },
            ],
            [
                {
                    count: 10,
                    lastObject: '43',
                },
            ],
        ]);
    });

    it('minObjectsToLoad should not be bigger than half of maxWindowSize', () => {
        expect(() => createTimescaleRequestWindow({
            bufferSize: 100,
            minObjectsToLoad: 51,
            loadNextObjects: vi.fn(),
        })).toThrow();

        expect(() => createTimescaleRequestWindow({
            bufferSize: 100,
            minObjectsToLoad: 50,
            loadNextObjects: vi.fn(),
        })).not.toThrow();
    });

    it('should correctly handle limits', async () => {
        const loadNextObjects = vi.fn<TimescaleRequestWindowLoadNextObjectsFunction<number>>(({
            lastObject,
            count,
        }): Promise<TimescaleRequestWindowLoadNextObjectsReturnType<number>> => {
            const nextNumber = lastObject === undefined
                ? 0
                : (lastObject + 1);

            let isLast = false;
            const objects: number[] = [];

            for (let i = 0; i < count; i++) {
                const number = i + nextNumber;

                if (number >= 50) {
                    isLast = true;
                    break;
                }

                objects.push(number);
            }

            return Promise.resolve({
                objects,
                isLast,
            });
        });

        const window = createTimescaleRequestWindow({
            bufferSize: 50,
            minObjectsToLoad: 10,
            loadNextObjects,
        });

        const result1 = await window.getNextObjects(35);

        expect(result1).toEqual({
            isLast: false,
            objects: [
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

        const result2 = await window.getNextObjects(5);

        expect(result2).toEqual({
            isLast: false,
            objects: [
                35,
                36,
                37,
                38,
                39,
            ],
        });

        expect(loadNextObjects.mock.calls).toEqual([
            [
                {
                    count: 35,
                    lastObject: undefined,
                },
            ],
            [
                {
                    count: 10,
                    lastObject: 34,
                },
            ],
        ]);

        const result3 = await window.getNextObjects(6);

        expect(result3).toEqual({
            isLast: false,
            objects: [
                40,
                41,
                42,
                43,
                44,
                45,
            ],
        });

        expect(loadNextObjects.mock.calls.length).toEqual(3);
        expect(loadNextObjects.mock.calls[2]).toEqual([
            {
                count: 10,
                lastObject: 44,
            },
        ]);

        const result4 = await window.getNextObjects(6);

        expect(result4).toEqual({
            isLast: true,
            objects: [
                46,
                47,
                48,
                49,
            ],
        });

        expect(loadNextObjects.mock.calls.length).toEqual(3);

        const result5 = await window.getNextObjects(600);

        expect(result5).toEqual({
            isLast: true,
            objects: [],
        });
        expect(loadNextObjects.mock.calls.length).toEqual(3);

        const result6 = await window.getNextObjects(1);

        expect(result6).toEqual({
            isLast: true,
            objects: [],
        });
        expect(loadNextObjects.mock.calls.length).toEqual(3);
    });

    it('should return isLast=true with empty result if loadNextObjects returns empty object', async () => {
        const resolvers: ((value: TimescaleRequestWindowLoadNextObjectsReturnType<number>) => void)[] = [];
        const loadNextObjects = vi.fn<TimescaleRequestWindowLoadNextObjectsFunction<number>>((): Promise<TimescaleRequestWindowLoadNextObjectsReturnType<number>> => new Promise((resolve) => {
            resolvers.push(resolve);
        }));

        expect(resolvers.length).toEqual(0);

        const window = createTimescaleRequestWindow({
            bufferSize: 1000,
            minObjectsToLoad: 10,
            loadNextObjects,
        });

        const promise1 = window.getNextObjects(10);

        await Promise.race([
            promise1.then(() => {
                throw new Error('should not be called before resolver call');
            }),
            promiseTimeout(5),
        ]);

        resolvers[0]({
            objects: [
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
            objects: [
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

        const promise2 = window.getNextObjects(10);

        await Promise.race([
            promise2.then(() => {
                throw new Error('promise2 should not be called before resolver call');
            }),
            promiseTimeout(5),
        ]);

        resolvers[1]({
            objects: [],
            isLast: true,
        });

        expect(await promise2).toEqual({
            objects: [],
            isLast: true,
        });
    });

    it('should throw error is loadNextObjects returns wrong isLast parameter in first call', async () => {
        const window = createTimescaleRequestWindow({
            bufferSize: 1000,
            minObjectsToLoad: 10,
            loadNextObjects: (): Promise<TimescaleRequestWindowLoadNextObjectsReturnType<number>> => Promise.resolve({
                objects: [
                    1,
                    2,
                    3,
                    4,
                    5,
                ],
                isLast: false,
            }),
        });

        await expect(window.getNextObjects(10)).rejects.toThrow('loadNextObjects for isLast=false returned wrong objects count=[5] expected=[10]');
    });

    it('should throw error is loadNextObjects returns wrong isLast parameter in second call', async () => {
        const window = createTimescaleRequestWindow({
            bufferSize: 1000,
            minObjectsToLoad: 10,
            loadNextObjects: (): Promise<TimescaleRequestWindowLoadNextObjectsReturnType<number>> => Promise.resolve({
                objects: [
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

        await expect(window.getNextObjects(5)).resolves.toEqual({
            objects: [
                1,
                2,
                3,
                4,
                5,
            ],
            isLast: false,
        });

        await expect(window.getNextObjects(60)).rejects.toThrow('loadNextObjects for isLast=false returned wrong objects count=[10] expected=[55]');
    });

    it('should throw error if wrong objects count is requested', async () => {
        const window = createTimescaleRequestWindow({
            bufferSize: 1000,
            minObjectsToLoad: 1,
            loadNextObjects: (): Promise<TimescaleRequestWindowLoadNextObjectsReturnType<number>> => Promise.resolve({
                objects: [1],
                isLast: false,
            }),
        });

        await expect(window.getNextObjects(-2)).rejects.toThrow('value=[-2] is not a positive integer');
        await expect(window.getNextObjects(0.5)).rejects.toThrow('value=[0.5] is not a positive integer');
        await expect(window.getNextObjects(0)).rejects.toThrow('value=[0] is not a positive integer');
        await expect(window.getNextObjects(1)).resolves.toEqual({
            objects: [1],
            isLast: false,
        });
    });

    it('remove start of the window if there are too many objects', async () => {
        let currentNumber = 0;
        const window = createTimescaleRequestWindow({
            bufferSize: 20,
            minObjectsToLoad: 7,
            loadNextObjects: ({ count }): Promise<TimescaleRequestWindowLoadNextObjectsReturnType<number>> => {
                const numbers: number[] = [];

                callTimes(count, () => {
                    numbers.push(currentNumber++);
                });

                return Promise.resolve({
                    objects: numbers,
                    isLast: false,
                });
            },
        });

        const result1 = await window.getNextObjects(10);

        expect(result1.objects.join(',')).toEqual('0,1,2,3,4,5,6,7,8,9');

        const result2 = await window.getNextObjects(3);

        expect(result2.objects.join(',')).toEqual('10,11,12');

        const result3 = await window.getNextObjects(9);

        expect(result3.objects.join(',')).toEqual('13,14,15,16,17,18,19,20,21');
        // expect(window.getWindow().join(',')).toEqual('4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23');

        // const result4 = await window.getNextObjects(30);

        // expect(result4.objects.length).toEqual(30);
        // expect(result4.objects.join(',')).toEqual('22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51');
        // expect(window.getWindow().join(',')).toEqual('32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51');
    });
});
