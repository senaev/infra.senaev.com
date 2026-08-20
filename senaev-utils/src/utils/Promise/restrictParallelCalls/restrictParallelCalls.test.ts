import {
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { restrictParallelCalls } from './restrictParallelCalls';

describe('restrictParallelCalls', () => {
    test('should execute function normally when not called in parallel', async () => {
        const mockAsyncFunction = vi.fn().mockImplementation(async (value: string) => {
            await new Promise((resolve) => setTimeout(resolve, 10));

            return `processed: ${value}`;
        });
        const restrictedFunction = restrictParallelCalls(mockAsyncFunction);

        const result = await restrictedFunction('test');

        expect(mockAsyncFunction).toHaveBeenCalledTimes(1);
        expect(mockAsyncFunction).toHaveBeenCalledWith('test');
        expect(result).toBe('processed: test');
    });

    test('should throw error when called in parallel', async () => {
        const mockAsyncFunction = vi.fn().mockImplementation(async (value: string) => {
            await new Promise((resolve) => setTimeout(resolve, 10));

            return `processed: ${value}`;
        });
        const restrictedFunction = restrictParallelCalls(mockAsyncFunction, 'test error message');

        // Start first call (don't await it)
        const firstCall = restrictedFunction('first');

        // Try to call again while first is still running
        expect(() => {
            restrictedFunction('second');
        }).toThrow('restrictParallelCalls errorMessage=[test error message] previous call is not finished, do not call function in parallel');

        // Wait for first call to complete
        await firstCall;

        // Now second call should work
        const secondCall = await restrictedFunction('second');

        expect(secondCall).toBe('processed: second');
    });

    test('should allow subsequent calls after previous call completes', async () => {
        const mockAsyncFunction = vi.fn().mockImplementation(async (value: string) => {
            await new Promise((resolve) => setTimeout(resolve, 10));

            return `processed: ${value}`;
        });
        const restrictedFunction = restrictParallelCalls(mockAsyncFunction);

        // First call
        const result1 = await restrictedFunction('first');

        expect(result1).toBe('processed: first');

        // Second call should work
        const result2 = await restrictedFunction('second');

        expect(result2).toBe('processed: second');

        expect(mockAsyncFunction).toHaveBeenCalledTimes(2);
    });

    test('should handle function that throws error', async () => {
        const errorFunction = vi.fn().mockRejectedValue(new Error('Test error'));
        const restrictedFunction = restrictParallelCalls(errorFunction);

        await expect(restrictedFunction('test')).rejects.toThrow('Test error');

        // After error, function should be available for next call
        const normalFunction = vi.fn().mockResolvedValue('success');
        const restrictedNormalFunction = restrictParallelCalls(normalFunction);
        const result = await restrictedNormalFunction('test');

        expect(result).toBe('success');
    });

    test('should handle function with multiple parameters', async () => {
        const multiParamFunction = vi.fn().mockImplementation((a: number, b: string, c: boolean) => Promise.resolve(`${a}-${b}-${c}`));
        const restrictedFunction = restrictParallelCalls(multiParamFunction);

        const result = await restrictedFunction(1, 'test', true);

        expect(multiParamFunction).toHaveBeenCalledWith(1, 'test', true);
        expect(result).toBe('1-test-true');
    });

    test('should handle function that returns void promise', async () => {
        const voidFunction = vi.fn().mockImplementation(() => Promise.resolve());
        const restrictedFunction = restrictParallelCalls(voidFunction);

        const result = await restrictedFunction();

        expect(voidFunction).toHaveBeenCalledTimes(1);
        expect(result).toBeUndefined();
    });

    test('should preserve function context and binding', async () => {
        class TestClass {
            public value = 'test';

            public method(param: string): Promise<string> {
                return Promise.resolve(`${this.value}: ${param}`);
            }
        }

        const instance = new TestClass();
        const restrictedMethod = restrictParallelCalls(instance.method.bind(instance));

        const result = await restrictedMethod('param');

        expect(result).toBe('test: param');
    });

    test('should handle rapid sequential calls', async () => {
        const mockAsyncFunction = vi.fn().mockImplementation(async (value: string) => {
            await new Promise((resolve) => setTimeout(resolve, 10));

            return `processed: ${value}`;
        });
        const restrictedFunction = restrictParallelCalls(mockAsyncFunction);

        // Make multiple sequential calls (await each one individually)
        const result1 = await restrictedFunction('call1');
        const result2 = await restrictedFunction('call2');
        const result3 = await restrictedFunction('call3');

        expect(result1).toBe('processed: call1');
        expect(result2).toBe('processed: call2');
        expect(result3).toBe('processed: call3');
        expect(mockAsyncFunction).toHaveBeenCalledTimes(3);
    });

    test('should work with generic function types', async () => {
        interface TestInterface {
            id: number;
            name: string;
        }

        const genericFunction = vi.fn().mockImplementation((input: TestInterface): Promise<TestInterface> => Promise.resolve({
            ...input,
            name: input.name.toUpperCase(),
        }));

        const restrictedFunction = restrictParallelCalls(genericFunction);

        const result = await restrictedFunction({
            id: 1,
            name: 'test',
        });

        expect(result).toEqual({
            id: 1,
            name: 'TEST',
        });
    });

    test('should handle function with no parameters', async () => {
        const noParamFunction = vi.fn().mockResolvedValue('no-params');
        const restrictedFunction = restrictParallelCalls(noParamFunction);

        const result = await restrictedFunction();

        expect(noParamFunction).toHaveBeenCalledTimes(1);
        expect(result).toBe('no-params');
    });

    test('should handle function that rejects after being called in parallel', async () => {
        const mockAsyncFunction = vi.fn().mockImplementation(async (value: string) => {
            await new Promise((resolve) => setTimeout(resolve, 10));

            if (value === 'error') {
                throw new Error('Test error');
            }

            return `processed: ${value}`;
        });
        const restrictedFunction = restrictParallelCalls(mockAsyncFunction);

        // Start first call (don't await it)
        const firstCall = restrictedFunction('error');

        // Try to call again while first is still running
        expect(() => {
            restrictedFunction('second');
        }).toThrow('restrictParallelCalls previous call is not finished, do not call function in parallel');

        // Wait for first call to complete (it will reject)
        await expect(firstCall).rejects.toThrow('Test error');

        // Now second call should work
        const secondCall = await restrictedFunction('second');

        expect(secondCall).toBe('processed: second');
    });

    test('should handle function with complex return type', async () => {
        interface ComplexResult {
            data: string[];
            metadata: {
                count: number;
                timestamp: number;
            };
        }

        const complexFunction = vi.fn().mockImplementation((input: string): Promise<ComplexResult> => Promise.resolve({
            data: [
                input,
                input.toUpperCase(),
            ],
            metadata: {
                count: 2,
                timestamp: Date.now(),
            },
        }));

        const restrictedFunction = restrictParallelCalls(complexFunction);

        const result = await restrictedFunction('test');

        expect(result.data).toEqual([
            'test',
            'TEST',
        ]);
        expect(result.metadata.count).toBe(2);
        expect(typeof result.metadata.timestamp).toBe('number');
    });
});
