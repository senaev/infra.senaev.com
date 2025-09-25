import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { ObservableMap } from './ObservableMap';

describe('ObservableMap', () => {
    describe('constructor', () => {
        it('should create an empty ObservableMap', () => {
            const map = new ObservableMap<string, number>();

            expect(map.size).toBe(0);
        });

        it('should create ObservableMap with initial entries', () => {
            const entries: [string, number][] = [
                [
                    'a',
                    1,
                ],
                [
                    'b',
                    2,
                ],
            ];
            const map = new ObservableMap(entries);

            expect(map.size).toBe(2);
            expect(map.get('a')).toBe(1);
            expect(map.get('b')).toBe(2);
        });

        it('should create ObservableMap from another Map', () => {
            const sourceMap = new Map([
                [
                    'x',
                    10,
                ],
                [
                    'y',
                    20,
                ],
            ]);
            const map = new ObservableMap(sourceMap);

            expect(map.size).toBe(2);
            expect(map.get('x')).toBe(10);
            expect(map.get('y')).toBe(20);
        });
    });

    describe('subscribe', () => {
        it('should add callback to callbacks set', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            const unsubscribe = map.subscribe(callback);

            expect(typeof unsubscribe).toBe('function');
        });

        it('should return unsubscribe function that removes callback', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            const unsubscribe = map.subscribe(callback);

            unsubscribe();

            // Callback should not be called after unsubscribing
            map.set('test', 42);
            expect(callback).not.toHaveBeenCalled();
        });

        it('should allow multiple callbacks', () => {
            const map = new ObservableMap<string, number>();
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            map.subscribe(callback1);
            map.subscribe(callback2);

            map.set('test', 42);

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
        });

        it('should handle unsubscribing multiple times gracefully', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            const unsubscribe = map.subscribe(callback);

            unsubscribe();
            unsubscribe(); // Should not throw

            map.set('test', 42);
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('set', () => {
        it('should set value and call callbacks with set event', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            map.subscribe(callback);
            map.set('key', 42);

            expect(map.get('key')).toBe(42);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({
                type: 'set',
                key: 'key',
                value: 42,
            });
        });

        it('should update existing value and call callbacks', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            map.set('key', 10);
            map.subscribe(callback);
            map.set('key', 20);

            expect(map.get('key')).toBe(20);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({
                type: 'set',
                key: 'key',
                value: 20,
            });
        });

        it('should return this for chaining', () => {
            const map = new ObservableMap<string, number>();

            const result = map.set('key', 42);

            expect(result).toBe(map);
        });

        it('should work with different key and value types', () => {
            const map = new ObservableMap<number, string>();
            const callback = vi.fn();

            map.subscribe(callback);
            map.set(123, 'test');

            expect(map.get(123)).toBe('test');
            expect(callback).toHaveBeenCalledWith({
                type: 'set',
                key: 123,
                value: 'test',
            });
        });

        it('should work with object keys and values', () => {
            const map = new ObservableMap<{ id: number }, { name: string }>();
            const callback = vi.fn();
            const key = { id: 1 };
            const value = { name: 'test' };

            map.subscribe(callback);
            map.set(key, value);

            expect(map.get(key)).toBe(value);
            expect(callback).toHaveBeenCalledWith({
                type: 'set',
                key,
                value,
            });
        });
    });

    describe('delete', () => {
        it('should delete value and call callbacks with delete event', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            map.set('key', 42);
            map.subscribe(callback);
            const result = map.delete('key');

            expect(result).toBe(true);
            expect(map.has('key')).toBe(false);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({
                type: 'delete',
                key: 'key',
                value: 42,
            });
        });

        it('should not call callbacks when key does not exist', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            map.subscribe(callback);
            const result = map.delete('nonexistent');

            expect(result).toBe(false);
            expect(callback).not.toHaveBeenCalled();
        });

        it('should return false when key does not exist', () => {
            const map = new ObservableMap<string, number>();

            const result = map.delete('nonexistent');

            expect(result).toBe(false);
        });

        it('should work with undefined values', () => {
            const map = new ObservableMap<string, number | undefined>();
            const callback = vi.fn();

            map.set('key', undefined);
            map.subscribe(callback);
            map.delete('key');

            expect(callback).toHaveBeenCalledWith({
                type: 'delete',
                key: 'key',
                value: undefined,
            });
        });

        it('should work with different key types', () => {
            const map = new ObservableMap<number, string>();
            const callback = vi.fn();

            map.set(123, 'test');
            map.subscribe(callback);
            map.delete(123);

            expect(callback).toHaveBeenCalledWith({
                type: 'delete',
                key: 123,
                value: 'test',
            });
        });
    });

    describe('inherited Map methods', () => {
        it('should support all Map methods', () => {
            const map = new ObservableMap<string, number>();

            // Test various Map methods
            expect(map.size).toBe(0);
            expect(map.has('key')).toBe(false);

            map.set('key', 42);
            expect(map.size).toBe(1);
            expect(map.has('key')).toBe(true);
            expect(map.get('key')).toBe(42);

            const entries = Array.from(map.entries());

            expect(entries).toEqual([
                [
                    'key',
                    42,
                ],
            ]);

            const keys = Array.from(map.keys());

            expect(keys).toEqual(['key']);

            const values = Array.from(map.values());

            expect(values).toEqual([42]);

            map.clear();
            expect(map.size).toBe(0);
        });

        it('should not trigger callbacks for inherited methods other than set/delete', () => {
            const map = new ObservableMap<string, number>();
            const callback = vi.fn();

            map.subscribe(callback);
            map.set('key', 42);

            // Clear should not trigger callbacks
            map.clear();
            expect(callback).toHaveBeenCalledTimes(1); // Only the set call

            // has, get, etc. should not trigger callbacks
            map.set('key', 42);
            map.has('key');
            map.get('key');
            expect(callback).toHaveBeenCalledTimes(2); // Only the set calls
        });
    });

    describe('event types', () => {
        it('should emit correct event types', () => {
            const map = new ObservableMap<string, number>();
            const setCallback = vi.fn();
            const deleteCallback = vi.fn();

            map.subscribe((event) => {
                if (event.type === 'set') {
                    setCallback(event);
                } else if (event.type === 'delete') {
                    deleteCallback(event);
                }
            });

            map.set('key', 42);
            map.delete('key');

            expect(setCallback).toHaveBeenCalledWith({
                type: 'set',
                key: 'key',
                value: 42,
            });

            expect(deleteCallback).toHaveBeenCalledWith({
                type: 'delete',
                key: 'key',
                value: 42,
            });
        });
    });

    describe('edge cases', () => {
        it('should handle multiple subscriptions and unsubscriptions', () => {
            const map = new ObservableMap<string, number>();
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            const callback3 = vi.fn();

            const unsubscribe1 = map.subscribe(callback1);
            const unsubscribe2 = map.subscribe(callback2);
            const unsubscribe3 = map.subscribe(callback3);

            map.set('key', 42);
            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
            expect(callback3).toHaveBeenCalledTimes(1);

            unsubscribe2();
            map.set('key', 43);
            expect(callback1).toHaveBeenCalledTimes(2);
            expect(callback2).toHaveBeenCalledTimes(1); // Should not be called
            expect(callback3).toHaveBeenCalledTimes(2);

            unsubscribe1();
            unsubscribe3();
            map.set('key', 44);
            expect(callback1).toHaveBeenCalledTimes(2); // Should not be called
            expect(callback2).toHaveBeenCalledTimes(1); // Should not be called
            expect(callback3).toHaveBeenCalledTimes(2); // Should not be called
        });

        it('should NOT handle callback throwing errors gracefully', () => {
            const map = new ObservableMap<string, number>();
            const goodCallback = vi.fn();
            const badCallback = vi.fn(() => {
                throw new Error('Callback error');
            });

            map.subscribe(goodCallback);
            map.subscribe(badCallback);

            // Should not throw and good callback should still be called
            expect(() => map.set('key', 42)).toThrow();
            expect(goodCallback).toHaveBeenCalledTimes(1);
            expect(badCallback).toHaveBeenCalledTimes(1);
        });

        it('should maintain Map behavior with complex objects', () => {
            const map = new ObservableMap<{ id: number }, { data: string }>();
            const callback = vi.fn();

            const key1 = { id: 1 };
            const key2 = { id: 1 }; // Different object reference
            const value1 = { data: 'test1' };
            const value2 = { data: 'test2' };

            map.subscribe(callback);
            map.set(key1, value1);
            map.set(key2, value2); // Should create separate entry

            expect(map.size).toBe(2);
            expect(map.get(key1)).toBe(value1);
            expect(map.get(key2)).toBe(value2);
            expect(callback).toHaveBeenCalledTimes(2);
        });
    });
});
