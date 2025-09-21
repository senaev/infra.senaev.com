import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { callFirstThenOther } from './callFirstThenOther';

describe('callFirstThenOther', () => {
    it('should call first function on first invocation', () => {
        const firstFn = vi.fn().mockReturnValue('first');
        const otherFn = vi.fn().mockReturnValue('other');

        const wrappedFn = callFirstThenOther(firstFn, otherFn);
        const result = wrappedFn();

        expect(firstFn).toHaveBeenCalledTimes(1);
        expect(otherFn).not.toHaveBeenCalled();
        expect(result).toBe('first');
    });

    it('should call other function on subsequent invocations', () => {
        const firstFn = vi.fn().mockReturnValue('first');
        const otherFn = vi.fn().mockReturnValue('other');

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        // First call
        const firstResult = wrappedFn();

        expect(firstResult).toBe('first');

        // Second call
        const secondResult = wrappedFn();

        expect(secondResult).toBe('other');

        // Third call
        const thirdResult = wrappedFn();

        expect(thirdResult).toBe('other');

        expect(firstFn).toHaveBeenCalledTimes(1);
        expect(otherFn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments correctly to functions', () => {
        const firstFn = vi.fn().mockImplementation((a, b) => `first: ${a}, ${b}`);
        const otherFn = vi.fn().mockImplementation((a, b) => `other: ${a}, ${b}`);

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        const result1 = wrappedFn('arg1', 'arg2');

        expect(result1).toBe('first: arg1, arg2');
        expect(firstFn).toHaveBeenCalledWith('arg1', 'arg2');

        const result2 = wrappedFn('arg3', 'arg4');

        expect(result2).toBe('other: arg3, arg4');
        expect(otherFn).toHaveBeenCalledWith('arg3', 'arg4');
    });

    it('should preserve this context', () => {
        const context = { value: 'test' };
        const firstFn = vi.fn().mockReturnValue('first');
        const otherFn = vi.fn().mockReturnValue('other');

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        // First call with context
        const result1 = wrappedFn.call(context);

        expect(firstFn).toHaveBeenCalledWith();
        expect(firstFn.mock.instances[0]).toBe(context);

        // Second call with context
        const result2 = wrappedFn.call(context);

        expect(otherFn).toHaveBeenCalledWith();
        expect(otherFn.mock.instances[0]).toBe(context);
    });

    it('should handle functions that return undefined', () => {
        const firstFn = vi.fn().mockReturnValue(undefined);
        const otherFn = vi.fn().mockReturnValue(undefined);

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        const result1 = wrappedFn();
        const result2 = wrappedFn();

        expect(result1).toBeUndefined();
        expect(result2).toBeUndefined();
        expect(firstFn).toHaveBeenCalledTimes(1);
        expect(otherFn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that throw errors', () => {
        const firstFn = vi.fn().mockImplementation(() => {
            throw new Error('First function error');
        });
        const otherFn = vi.fn().mockImplementation(() => {
            throw new Error('Other function error');
        });

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        // First call should throw from first function
        expect(() => wrappedFn()).toThrow('First function error');
        expect(firstFn).toHaveBeenCalledTimes(1);
        expect(otherFn).not.toHaveBeenCalled();

        // Second call should throw from other function
        expect(() => wrappedFn()).toThrow('Other function error');
        expect(firstFn).toHaveBeenCalledTimes(1);
        expect(otherFn).toHaveBeenCalledTimes(1);
    });

    it('should handle async functions', async () => {
        const firstFn = vi.fn().mockResolvedValue('first async');
        const otherFn = vi.fn().mockResolvedValue('other async');

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        const result1 = await wrappedFn();

        expect(result1).toBe('first async');
        expect(firstFn).toHaveBeenCalledTimes(1);
        expect(otherFn).not.toHaveBeenCalled();

        const result2 = await wrappedFn();

        expect(result2).toBe('other async');
        expect(firstFn).toHaveBeenCalledTimes(1);
        expect(otherFn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions with different return types', () => {
        const firstFn = vi.fn().mockReturnValue(42);
        const otherFn = vi.fn().mockReturnValue('string');

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        const result1 = wrappedFn();

        expect(typeof result1).toBe('number');
        expect(result1).toBe(42);

        const result2 = wrappedFn();

        expect(typeof result2).toBe('string');
        expect(result2).toBe('string');
    });

    it('should work with multiple instances independently', () => {
        const firstFn1 = vi.fn().mockReturnValue('first1');
        const otherFn1 = vi.fn().mockReturnValue('other1');
        const firstFn2 = vi.fn().mockReturnValue('first2');
        const otherFn2 = vi.fn().mockReturnValue('other2');

        const wrappedFn1 = callFirstThenOther(firstFn1, otherFn1);
        const wrappedFn2 = callFirstThenOther(firstFn2, otherFn2);

        // Call first instance
        expect(wrappedFn1()).toBe('first1');
        expect(wrappedFn1()).toBe('other1');

        // Call second instance
        expect(wrappedFn2()).toBe('first2');
        expect(wrappedFn2()).toBe('other2');

        expect(firstFn1).toHaveBeenCalledTimes(1);
        expect(otherFn1).toHaveBeenCalledTimes(1);
        expect(firstFn2).toHaveBeenCalledTimes(1);
        expect(otherFn2).toHaveBeenCalledTimes(1);
    });

    it('should handle functions with no parameters', () => {
        const firstFn = vi.fn().mockReturnValue('first');
        const otherFn = vi.fn().mockReturnValue('other');

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        const result1 = wrappedFn();
        const result2 = wrappedFn();

        expect(result1).toBe('first');
        expect(result2).toBe('other');
        expect(firstFn).toHaveBeenCalledWith();
        expect(otherFn).toHaveBeenCalledWith();
    });

    it('should handle functions with many parameters', () => {
        const firstFn = vi.fn().mockReturnValue('first');
        const otherFn = vi.fn().mockReturnValue('other');

        const wrappedFn = callFirstThenOther(firstFn, otherFn);

        const args = [
            1,
            'two',
            true,
            null,
            undefined,
            {},
            [],
        ];
        const result1 = wrappedFn(...args);
        const result2 = wrappedFn(...args);

        expect(result1).toBe('first');
        expect(result2).toBe('other');
        expect(firstFn).toHaveBeenCalledWith(...args);
        expect(otherFn).toHaveBeenCalledWith(...args);
    });
});
