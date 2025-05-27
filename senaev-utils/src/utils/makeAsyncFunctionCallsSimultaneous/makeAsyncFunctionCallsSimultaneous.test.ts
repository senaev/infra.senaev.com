import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

import { makeAsyncFunctionCallsSimultaneous } from './makeAsyncFunctionCallsSimultaneous';

describe('makeAsyncFunctionCallsSimultaneous', () => {
    it('should execute async operations sequentially', async () => {
        const executionOrder: number[] = [];
        const delays = [
            10,
            5,
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            6,
            5,
            4,
            3,
            2,
            10,
            1,
        ];

        const asyncOperation = vi.fn(async (num: number) => {
            await promiseTimeout(delays[num]);
            executionOrder.push(num);
        });

        const wrappedFunction = makeAsyncFunctionCallsSimultaneous(asyncOperation);

        await Promise.all(delays.map((_delay, index) => wrappedFunction(index)));

        // Operations should be executed in order of calling
        expect(executionOrder).toEqual([
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
        ]);
        expect(asyncOperation).toHaveBeenCalledTimes(17);
    });

    it('should NOT handle errors without breaking the queue', async () => {
        const executionOrder: number[] = [];

        const asyncOperation = vi.fn(async (num: number) => {
            await Promise.resolve();

            if (num === 1) {
                throw new Error('Test error');
            }
            executionOrder.push(num);

            return num;
        });

        const wrappedFunction = makeAsyncFunctionCallsSimultaneous(asyncOperation);

        const result = await Promise.all([
            wrappedFunction(0),
            wrappedFunction(1).catch((error) => error.message),
            wrappedFunction(2),
        ]);

        expect(result).toEqual([
            0,
            'Test error',
            2,
        ]);

        // Operations should be executed in order, with failed operation skipped
        expect(executionOrder).toEqual([
            0,
            2,
        ]);
        expect(asyncOperation).toHaveBeenCalledTimes(3);
    });

    it('should handle sync errors', async () => {
        const syncOperation = vi.fn((num: number) => {
            if (num === 1) {
                throw new Error('Test error');
            }

            return num;
        });

        const wrappedFunction = makeAsyncFunctionCallsSimultaneous(syncOperation);

        const result = await Promise.all([
            wrappedFunction(0),
            wrappedFunction(1).catch((error) => error.message),
            wrappedFunction(2),
        ]);

        expect(result).toEqual([
            0,
            'Test error',
            2,
        ]);

        expect(syncOperation).toHaveBeenCalledTimes(3);
    });
});
