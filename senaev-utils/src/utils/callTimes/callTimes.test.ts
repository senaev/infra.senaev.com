import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { callTimes } from './callTimes';

describe('callTimes', () => {
    it('should call the function the specified number of times', () => {
        const mockFn = vi.fn();
        callTimes(3, mockFn);
        expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should pass the correct index to each function call', () => {
        const mockFn = vi.fn();
        callTimes(3, mockFn);
        expect(mockFn).toHaveBeenNthCalledWith(1, 0);
        expect(mockFn).toHaveBeenNthCalledWith(2, 1);
        expect(mockFn).toHaveBeenNthCalledWith(3, 2);
    });

    it('should not call the function when times is 0', () => {
        const mockFn = vi.fn();
        callTimes(0, mockFn);
        expect(mockFn).not.toHaveBeenCalled();
    });

    it('should handle negative numbers by not calling the function', () => {
        const mockFn = vi.fn();
        callTimes(-1, mockFn);
        expect(mockFn).not.toHaveBeenCalled();
    });
});
