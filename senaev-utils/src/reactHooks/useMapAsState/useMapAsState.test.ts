import { act, renderHook } from '@testing-library/react';
import {
    describe, expect, it,
} from 'vitest';

import { noop } from '../../utils/Function/noop';

import { MapAsState, useMapAsState } from './useMapAsState';

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

        expect(result.current[0].get('key1')).toBe('value1');
        expect(result.current[0].get('key2')).toBe('value2');
        expect(result.current[1]).toBe(0);
    });

    it('should set new values and trigger reload', () => {
        const initialMap = new Map();
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current[1]).toBe(0);

        act(() => {
            result.current[0].set('newKey', 'newValue');
        });

        expect(result.current[0].get('newKey')).toBe('newValue');
        expect(result.current[1]).toBe(1);
    });

    it('should not trigger reload when setting same value', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current[1]).toBe(0);

        act(() => {
            result.current[0].set('key1', 'value1');
        });

        expect(result.current[0].get('key1')).toBe('value1');
        expect(result.current[1]).toBe(0);
    });

    it('should update existing values and trigger reload', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current[1]).toBe(0);

        act(() => {
            result.current[0].set('key1', 'updatedValue');
        });

        expect(result.current[0].get('key1')).toBe('updatedValue');
        expect(result.current[1]).toBe(1);
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

        expect(result.current[1]).toBe(0);

        act(() => {
            const deleted = result.current[0].delete('key1');

            expect(deleted).toBe(true);
        });

        expect(result.current[0].get('key1')).toBeUndefined();
        expect(result.current[0].get('key2')).toBe('value2');
        expect(result.current[1]).toBe(1);
    });

    it('should not trigger reload when deleting non-existent key', () => {
        const initialMap = new Map([
            [
                'key1',
                'value1',
            ],
        ]);
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current[1]).toBe(0);

        act(() => {
            const deleted = result.current[0].delete('nonExistentKey');

            expect(deleted).toBe(false);
        });

        expect(result.current[1]).toBe(0);
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

        const keys = Array.from(result.current[0].keys());

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

        const entries = Array.from(result.current[0].entries());

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

    it('should provide values iterator', () => {
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

        const values = Array.from(result.current[0].values());

        expect(values).toEqual([
            'value1',
            'value2',
        ]);
    });

    it('should provide forEach method', () => {
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

        const forEachResults: Array<[string, string]> = [];

        result.current[0].forEach((value, key) => {
            forEachResults.push([
                key,
                value,
            ]);
        });

        expect(forEachResults).toEqual([
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

    it('should check if key exists with has method', () => {
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

        expect(result.current[0].has('key1')).toBe(true);
        expect(result.current[0].has('key2')).toBe(true);
        expect(result.current[0].has('nonExistentKey')).toBe(false);
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

        expect(result.current[0].get(1)).toBe('number key');
        expect(result.current[0].get('string')).toBe(42);
        expect(result.current[0].get(true)).toEqual({ complex: 'object' });
    });

    it('should handle multiple operations and increment reload index', () => {
        const initialMap = new Map();
        const { result } = renderHook(() => useMapAsState(initialMap));

        expect(result.current[1]).toBe(0);

        act(() => {
            result.current[0].set('key1', 'value1');
        });
        expect(result.current[1]).toBe(1);

        act(() => {
            result.current[0].set('key2', 'value2');
        });
        expect(result.current[1]).toBe(2);

        act(() => {
            result.current[0].set('key2', 'value2');
        });
        expect(result.current[1]).toBe(2);

        act(() => {
            result.current[0].set('key2', 'value3');
        });
        expect(result.current[1]).toBe(3);

        act(() => {
            result.current[0].delete('key1');
        });
        expect(result.current[1]).toBe(4);
    });

    it('types are compatible with Map', () => {
        const initialMap = new Map<string, number>();
        const mapAsState: MapAsState<string, number> = initialMap;

        noop(mapAsState);
    });
});
