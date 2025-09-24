import { useRef } from 'react';

import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { useReload } from '../useReload';

export type MapAsState<K, V> = {
    get: Map<K, V>['get'];
    set: (key: K, value: V) => MapAsState<K, V>;
    has: Map<K, V>['has'];
    keys: Map<K, V>['keys'];
    values: Map<K, V>['values'];
    entries: Map<K, V>['entries'];
    forEach: Map<K, V>['forEach'];
    delete: Map<K, V>['delete'];
};

export function useMapAsState<K, V>(initialValue?: Iterable<readonly [K, V]> | null): [MapAsState<K, V>, UnsignedInteger] {
    const [
        reload,
        reloadIndex,
    ] = useReload();

    const mapRef = useRef<Map<K, V>>(new Map(initialValue));

    const mapAsState = {
        reloadIndex,
        get: (key: K) => mapRef.current.get(key),
        set: (key: K, value: V) => {
            const previousValue = mapRef.current.get(key);

            mapRef.current.set(key, value);

            if (value !== previousValue) {
                reload();
            }

            return mapAsState;
        },
        has: (key: K) => mapRef.current.has(key),
        keys: () => mapRef.current.keys(),
        values: () => mapRef.current.values(),
        entries: () => mapRef.current.entries(),
        forEach: (callback: Parameters<Map<K, V>['forEach']>[0]) => mapRef.current.forEach(callback),
        delete: (key: K) => {
            const isDeleted = mapRef.current.delete(key);

            if (isDeleted) {
                reload();
            }

            return isDeleted;
        },
    };

    return [
        mapAsState,
        reloadIndex,
    ];
}
