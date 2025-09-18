import { useRef } from 'react';

import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { useReload } from '../useReload';

export type MapAsState<K, V> = {
    get: Map<K, V>['get'];
    set: (key: K, value: V) => MapAsState<K, V>;
    keys: Map<K, V>['keys'];
    entries: Map<K, V>['entries'];
    delete: Map<K, V>['delete'];
};

export function useMapAsState<K, V>(initialValue?: Iterable<readonly [K, V]> | null): [MapAsState<K, V>, UnsignedInteger] {
    const [
        reloadIndex,
        reload,
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
        keys: () => mapRef.current.keys(),
        entries: () => mapRef.current.entries(),
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
