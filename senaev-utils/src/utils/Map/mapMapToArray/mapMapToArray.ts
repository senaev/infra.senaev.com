import { MapAsState } from '../../../reactHooks/useMapAsState/useMapAsState';

export function mapMapToArray<K, V, R>(map: MapAsState<K, V>, callback: (value: V, key: K) => R): R[] {
    return Array.from(map.entries(), ([
        key,
        value,
    ]) => callback(value, key));
}
