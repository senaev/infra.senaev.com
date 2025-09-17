export function mapMapValues<K, V, R>(map: Map<K, V>, callback: (value: V, key: K) => R): Map<K, R> {
    const result = new Map<K, R>();

    map.forEach((value, key) => {
        result.set(key, callback(value, key));
    });

    return result;
}
