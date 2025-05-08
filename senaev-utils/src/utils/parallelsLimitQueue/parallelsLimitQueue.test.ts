import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { promiseTimeout } from '../../promiseTimeout';
import { AnyFunction } from '../../types/AnyFunction';
import { waitForFunction } from '../../waitForFunction/waitForFunction';

import { parallelsLimitQueue } from './parallelsLimitQueue';

describe('parallelsLimitQueue', () => {
    it('should not execute next operation before previous one is finished', async () => {
        const resolvers: AnyFunction[] = [];

        const callback = vi.fn(async (param: number) => {
            await new Promise((resolve) => {
                resolvers.push(resolve);
            });
            return param * 2;
        });

        const queueFn = parallelsLimitQueue({
            callback,
            limit: 2,
        });

        const promise1 = queueFn(1);
        const promise2 = queueFn(2);
        const promise3 = queueFn(3);
        const promise4 = queueFn(4);

        // Start 4 operations
        const results = await Promise.all([
            promise1,
            promise2,
            Promise.race([
                promise3.catch(() => {
                    throw new Error('Promise 3 should NOT be resolved');
                }),
                promiseTimeout(5),
            ]),
            Promise.race([
                promise4.catch(() => {
                    throw new Error('Promise 4 should NOT be resolved');
                }),
                promiseTimeout(5),
            ]),
            promiseTimeout(0).then(() => {
                expect(callback).toHaveBeenCalledTimes(2);
                resolvers[0]();
                resolvers[1]();
            }),
        ]);

        await waitForFunction(() => callback.mock.calls.length === 4);

        // Check results are correct
        expect(results).toEqual([
            2,
            4,
            undefined,
            undefined,
            undefined,
        ]);

        resolvers[2]();

        const results1 = await Promise.all([
            promise1,
            promise2,
            promise3,
            Promise.race([
                promise4.catch(() => {
                    throw new Error('Promise 4 should NOT be resolved');
                }),
                promiseTimeout(10),
            ]),
        ]);

        expect(results1).toEqual([
            2,
            4,
            6,
            undefined,
        ]);

        resolvers[3]();

        const results3 = await Promise.all([
            promise1,
            promise2,
            promise3,
            promise4,
        ]);

        expect(results3).toEqual([
            2,
            4,
            6,
            8,
        ]);

        // Check callback was called 4 times
        expect(callback).toHaveBeenCalledTimes(4);
    });

    it('should use call limit', async () => {
        const resolvers: AnyFunction[] = [];
        const callback = vi.fn(async (param: number) => {
            await new Promise((resolve) => {
                resolvers.push(resolve);
            });
            return param * 2;
        });

        const queueFn = parallelsLimitQueue({
            callback,
            limit: 30,
        });

        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(queueFn(i));
        }

        expect(resolvers.length).toBe(30);

        for (let i = 5; i < 25; i++) {
            resolvers[i]();
        }

        await waitForFunction(() => resolvers.length === 50);

        const result = await Promise.all([
            Promise.race([
                promises[0].then(() => {
                    throw new Error('Promise 0 should NOT be resolved');
                }),
                promiseTimeout(10),
            ]),
            Promise.race([
                promises[4].then(() => {
                    throw new Error('Promise 4 should NOT be resolved');
                }),
                promiseTimeout(10),
            ]),
            promises[5],
            promises[24],
            Promise.race([
                promises[25].then(() => {
                    throw new Error('Promise 50 should NOT be resolved');
                }),
                promiseTimeout(10),
            ]),
            Promise.race([
                promises[99].then(() => {
                    throw new Error('Promise 50 should NOT be resolved');
                }),
                promiseTimeout(10),
            ]),
        ]);

        expect(result).toEqual([
            undefined,
            undefined,
            10,
            48,
            undefined,
            undefined,
        ]);

        expect(callback).toHaveBeenCalledTimes(50);
    });

    it('should handle errors properly', async () => {
        const callback = vi.fn(async (param: number) => {
            if (param === 2) throw new Error('Test error');
            return param * 2;
        });

        const queueFn = parallelsLimitQueue({
            callback,
            limit: 2,
        });

        const results = await Promise.allSettled([
            queueFn(1),
            queueFn(2),
            queueFn(3),
        ]);

        expect(results[0]).toEqual(expect.objectContaining({
            status: 'fulfilled',
            value: 2,
        }));
        expect(results[1]).toEqual(expect.objectContaining({
            status: 'rejected',
            reason: expect.any(Error),
        }));
        expect(results[2]).toEqual(expect.objectContaining({
            status: 'fulfilled',
            value: 6,
        }));
    });

    it('should handle empty queue gracefully', async () => {
        const callback = vi.fn(async (param: number) => param);

        parallelsLimitQueue({
            callback,
            limit: 1,
        });

        // No operations queued
        await promiseTimeout(10);

        expect(callback).not.toHaveBeenCalled();
    });

    it('should continue processing after an error', async () => {
        const successfulOperations: number[] = [];
        const callback = vi.fn(async (param: number) => {
            if (param === 2) throw new Error('Test error');
            successfulOperations.push(param);
            return param;
        });

        const queueFn = parallelsLimitQueue({
            callback,
            limit: 1,
        });

        await Promise.allSettled([
            queueFn(1),
            queueFn(2),
            queueFn(3),
        ]);

        expect(successfulOperations).toEqual([
            1,
            3,
        ]);
        expect(callback).toHaveBeenCalledTimes(3);
    });
});
