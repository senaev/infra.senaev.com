import {
    describe, expect, it, vi,
} from 'vitest';

import { retryFunctionWrapper } from './retryFunctionWrapper';

describe('retryFunctionWrapper', () => {
    it('resolves if the function succeeds on the first try', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        const wrapped = retryFunctionWrapper({
            fn,
            attempts: 4,
            delay: 10,
        });

        await expect(wrapped()).resolves.toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries the specified number of times before succeeding', async () => {
        let attempts = 0;
        const fn = vi.fn().mockImplementation(() => {
            attempts++;
            if (attempts < 3) {
                return Promise.reject(new Error('fail'));
            }

            return Promise.resolve('eventual success');
        });

        const wrapped = retryFunctionWrapper({
            fn,
            attempts: 6,
            delay: 10,
        });

        await expect(wrapped()).resolves.toBe('eventual success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('rejects if the function fails all attempts', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail always'));
        const wrapped = retryFunctionWrapper({
            fn,
            attempts: 3,
            delay: 10,
        });

        await expect(wrapped()).rejects.toThrow('fail always');
        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('calls onFailAttempt on the last failure', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail always'));
        const onFailAttempt = vi.fn();
        const wrapped = retryFunctionWrapper({
            fn,
            attempts: 2,
            delay: 10,
            onFailAttempt,
        });

        await expect(wrapped()).rejects.toThrow('fail always');
        expect(onFailAttempt).toHaveBeenCalledTimes(2);
        expect(onFailAttempt).toHaveBeenCalledWith(expect.any(Error), 0);
    });

    it('waits for the specified delay between retries', async () => {
        vi.useFakeTimers();
        let callCount = 0;
        const fn = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(new Error('fail'));
            }

            return Promise.resolve('success');
        });

        const delay = 500;
        const wrapped = retryFunctionWrapper({
            fn,
            attempts: 2,
            delay,
        });

        const promise = wrapped();

        // First call happens immediately
        expect(fn).toHaveBeenCalledTimes(1);

        // Advance time less than delay, should not have retried yet
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(fn).toHaveBeenCalledTimes(1);

        // Advance time to the delay, should retry now
        await vi.advanceTimersByTimeAsync(1);
        expect(fn).toHaveBeenCalledTimes(2);

        // Await the promise to ensure it resolves
        await expect(promise).resolves.toBe('success');

        vi.useRealTimers();
    });

    it('handles synchronous errors as failed attempts', async () => {
        let callCount = 0;
        const fn = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount < 3) {
                throw new Error('sync fail');
            }

            return Promise.resolve('success');
        });

        const wrapped = retryFunctionWrapper({
            fn,
            attempts: 3,
            delay: 10,
        });

        await expect(wrapped()).resolves.toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('passes the exact error object from the last attempt to onFailAttempt, even if errors differ', async () => {
        const error1 = new Error('fail 1');
        const error2 = new Error('fail 2');
        const error3 = new Error('fail 3');
        const fn = vi.fn()
            .mockImplementationOnce(() => Promise.reject(error1))
            .mockImplementationOnce(() => {
                throw error2;
            })
            .mockImplementationOnce(() => Promise.reject(error3));
        const onFailAttempt = vi.fn();

        const wrapped = retryFunctionWrapper({
            fn,
            attempts: 3,
            delay: 100,
            onFailAttempt,
        });

        await expect(wrapped()).rejects.toBe(error3);
        expect(onFailAttempt).toHaveBeenCalledTimes(3);
        expect(onFailAttempt).toHaveBeenNthCalledWith(1, error1, 0);
        expect(onFailAttempt).toHaveBeenNthCalledWith(2, error2, 1);
        expect(onFailAttempt).toHaveBeenNthCalledWith(3, error3, 2);
    });

    it('should handle function types', async () => {
        const wrapped = retryFunctionWrapper({
            fn: (a: number, b: string) => `${a} ${b}`,
            attempts: 3,
            delay: 10,
        });

        // @ts-expect-error - we're testing the function type
        wrapped();

        const result = wrapped(1, 'test');

        expect(result).instanceOf(Promise);
        expect(await result).toBe('1 test');

        // @ts-expect-error - we're testing the function type
        wrapped(1, 2);

        // @ts-expect-error - we're testing the function type
        wrapped(1);
    });
});
