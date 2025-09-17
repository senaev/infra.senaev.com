import { act, renderHook } from '@testing-library/react';
import {
    describe, expect, it,
} from 'vitest';

import { useMapAsState } from './useMapAsState';

describe('useMapAsState', () => {
    it('should initialize with provided map', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);

        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.get('key1')).toBe('value1');
        expect(result.current.get('key2')).toBe('value2');
        expect(result.current.reloadIndex).toBe(0);
    });

    it('should set new values and trigger reload', () => {
        const initialMap = new Map();
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.reloadIndex).toBe(0);

        act(() => {
            result.current.set('newKey', 'newValue');
        });

        expect(result.current.get('newKey')).toBe('newValue');
        expect(result.current.reloadIndex).toBe(1);
    });

    it('should not trigger reload when setting same value', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.reloadIndex).toBe(0);

        act(() => {
            result.current.set('key1', 'value1');
        });

        expect(result.current.get('key1')).toBe('value1');
        expect(result.current.reloadIndex).toBe(0);
    });

    it('should update existing values and trigger reload', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.reloadIndex).toBe(0);

        act(() => {
            result.current.set('key1', 'updatedValue');
        });

        expect(result.current.get('key1')).toBe('updatedValue');
        expect(result.current.reloadIndex).toBe(1);
    });

    it('should delete keys and trigger reload', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.reloadIndex).toBe(0);

        act(() => {
            const deleted = result.current.delete('key1');

            expect(deleted).toBe(true);
        });

        expect(result.current.get('key1')).toBeUndefined();
        expect(result.current.get('key2')).toBe('value2');
        expect(result.current.reloadIndex).toBe(1);
    });

    it('should not trigger reload when deleting non-existent key', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.reloadIndex).toBe(0);

        act(() => {
            const deleted = result.current.delete('nonExistentKey');

            expect(deleted).toBe(false);
        });

        expect(result.current.reloadIndex).toBe(0);
    });

    it('should provide keys iterator', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        const keys = Array.from(result.current.keys());

        expect(keys).toEqual([
            'key1',
            'key2',
        ]);
    });

    it('should provide entries iterator', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        const entries = Array.from(result.current.entries());

        expect(entries).toEqual([
            [
                'key1',
                'value1',
            ],
            [
                'key2',
                'value2',
            ],
        ]);
    });

    it('should work with different data types', () => {
        const initialMap = new Map<unknown, unknown>([
            [
                1,
                'number key',
            ],
            [
                'string',
                42,
            ],
            [
                true,
                { complex: 'object' },
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.get(1)).toBe('number key');
        expect(result.current.get('string')).toBe(42);
        expect(result.current.get(true)).toEqual({ complex: 'object' });
    });

    it('should handle multiple operations and increment reload index', () => {
        const initialMap = new Map();
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current.reloadIndex).toBe(0);

        act(() => {
            result.current.set('key1', 'value1');
        });
        expect(result.current.reloadIndex).toBe(1);

        act(() => {
            result.current.set('key2', 'value2');
        });
        expect(result.current.reloadIndex).toBe(2);

        act(() => {
            result.current.set('key2', 'value2');
        });
        expect(result.current.reloadIndex).toBe(2);

        act(() => {
            result.current.set('key2', 'value3');
        });
        expect(result.current.reloadIndex).toBe(3);

        act(() => {
            result.current.delete('key1');
        });
        expect(result.current.reloadIndex).toBe(4);
    });
});
