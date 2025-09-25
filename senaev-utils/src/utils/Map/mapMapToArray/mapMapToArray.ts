export function mapMapToArray<K, V, R>(map: Map<K, V>, callback: (value: V, key: K) => R): R[] {
    return Array.from(map.entries(), ([
        key,
        value,
    ]) => callback(value, key));
}
